import { logger } from '@/utils/logger';
/**
 * Client transport for the Tarkov metadata endpoints plus the shared Tarkov
 * access controller.
 *
 * Contract (owned jointly with the gateway/server side):
 * - Public runtime config: `tarkovAccessEnabled` (default false) and
 *   `tarkovAccessSiteKey` (string).
 * - `GET /api/tarkov/access-check` responds `{ ok: true }` uncached; when a
 *   Cloudflare mitigation is active the response carries `cf-mitigated:
 *   challenge` with an HTML challenge body.
 * - `POST /api/security/tarkov-verify` accepts `{ token }` and strictly runs
 *   Turnstile Siteverify.
 * - No application-issued clearance cookies or tokens exist: the Cloudflare
 *   clearance (`cf_clearance`) is managed entirely by Cloudflare.
 *
 * Shared behavior: a single-flight initial probe runs before any Tarkov data
 * request and never touches the local cache. Data requests resolve the raw
 * response's mitigation headers BEFORE reading the body; ordinary 403/429 and
 * server failures surface as regular errors and are never routed through the
 * challenge loop. Expired clearance triggers at most one renewal (generation
 * guarded so concurrent late challenges renew once) and at most one data
 * request retry. Only a flow that met a challenge parks its waiters behind the
 * visible retry UI; any other probe failure rejects its waiters and is not
 * remembered, so the next caller-initiated request probes again.
 */
/** Single-flight initial access probe, answered by the server with `{ ok: true }`. */
export const ACCESS_CHECK_ENDPOINT = '/api/tarkov/access-check';
/** Siteverify relay; strictly verifies the gate's Turnstile token server-side. */
export const TARKOV_VERIFY_ENDPOINT = '/api/security/tarkov-verify';
/** Turnstile widget action bound to the access gate.
 *
 * MUST equal the server-side `TARKOV_DATA_ACCESS_ACTION` (app/server/utils/turnstile.ts):
 * the strict Siteverify relay rejects tokens minted with any other action. It lives
 * as a mirrored literal because that server module is not bundled for the browser.
 */
export const TARKOV_ACCESS_WIDGET_ACTION = 'tarkov_data_access';
export const ACCESS_CHECK_TIMEOUT_MS = 15_000;
export const SITEVERIFY_TIMEOUT_MS = 15_000;
const CHALLENGE_MITIGATION_HEADER = 'cf-mitigated';
const CHALLENGE_MITIGATION_VALUE = 'challenge';
const STATUS_BODY_SNIPPET_MAX = 100;
/**
 * Access lifecycle phases as seen by the retry UI.
 * - `idle`: nothing started, or a flow's probe failed without meeting a
 *   challenge; the gate stays hidden, the failure reaches the flow's waiters
 *   through their own UIs, and the next request probes again.
 * - `probing`: a probe is running.
 * - `challenge`: the probe met a Cloudflare challenge; the retry UI shows.
 * - `verifying`: a solved token is being siteverified, followed by a re-probe.
 * - `released`: the probe succeeded; clearance is held by Cloudflare itself.
 * - `blocked` / `rate_limited` / `failed`: failures of a flow that met a
 *   challenge; the retry UI shows matching failure copy and its waiters park
 *   until the manual retry.
 */
export type TarkovAccessPhase =
  | 'idle'
  | 'probing'
  | 'challenge'
  | 'verifying'
  | 'released'
  | 'blocked'
  | 'rate_limited'
  | 'failed';
export type TarkovAccessFailureKind =
  'challenge' | 'challenge_exhausted' | 'blocked' | 'rate_limited' | 'failed';
export interface TarkovAccessRuntimeConfig {
  /** Contract default is false; the config owner decides how it is provisioned. */
  tarkovAccessEnabled?: boolean | string;
  tarkovAccessSiteKey?: string;
}
export interface TarkovApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Connected to every attempt; caller cancellation never cancels shared flow steps. */
  signal?: AbortSignal;
  /** Bounded per attempt, matching the ofetch `timeout` option used elsewhere. */
  timeout?: number;
  /** Transient retries per request, matching ofetch: default 1 for GET, 0 otherwise. */
  retry?: number;
  /** Fetch cache mode; the shared probe forces `no-store`, data requests inherit freshness. */
  cache?: RequestCache;
}
/**
 * Typed failure of the access flow or of a data request blocked by it. The
 * message carries endpoint and status context only — never request bodies.
 */
export class TarkovAccessError extends Error {
  readonly kind: TarkovAccessFailureKind;
  constructor(kind: TarkovAccessFailureKind, description: string, cause?: unknown) {
    super(description);
    this.name = 'TarkovAccessError';
    this.kind = kind;
    if (cause !== undefined) this.cause = cause;
  }
}
/** Non-2xx response of a Tarkov API endpoint; `status` supports transient detection. */
export class TarkovApiStatusError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly response: Response;
  constructor(response: Response, endpoint: string, bodySnippet: string) {
    super(
      `Tarkov API request to ${endpoint} failed with status ${response.status}` +
        (bodySnippet ? `: ${bodySnippet}` : '')
    );
    this.name = 'TarkovApiStatusError';
    this.status = response.status;
    this.endpoint = endpoint;
    this.response = response;
  }
}
export class TarkovApiInvalidResponseError extends Error {
  readonly endpoint: string;
  constructor(endpoint: string, bodySnippet: string) {
    super(
      `Tarkov API request to ${endpoint} returned a non-JSON response` +
        (bodySnippet ? `: ${bodySnippet}` : '')
    );
    this.name = 'TarkovApiInvalidResponseError';
    this.endpoint = endpoint;
  }
}
const truncateBodySnippet = (body: string): string =>
  body.length > STATUS_BODY_SNIPPET_MAX ? `${body.slice(0, STATUS_BODY_SNIPPET_MAX)}…` : body;
const toError = (cause: unknown): Error => {
  if (cause instanceof Error) return cause;
  return new Error(String(cause));
};
const createAbortError = (reason: unknown): Error => {
  if (reason instanceof Error) return reason;
  const abortError = new Error('Tarkov API request aborted');
  abortError.name = 'AbortError';
  return abortError;
};
interface LinkedRequestAbort {
  signal: AbortSignal;
  didTimeout: () => boolean;
  dispose: () => void;
}
/**
 * Joins the caller's signal into a per-attempt controller and adds an optional
 * per-attempt timeout. Everything is one attempt wide: the shared access flow
 * remains unaffected by caller cancellation.
 */
const createLinkedRequestAbort = (
  callerSignal?: AbortSignal,
  timeoutMs?: number
): LinkedRequestAbort => {
  const controller = new AbortController();
  let timedOut = false;
  const forwardAbort = (): void => {
    controller.abort();
  };
  callerSignal?.addEventListener('abort', forwardAbort);
  if (callerSignal?.aborted) forwardAbort();
  const timeoutTimer =
    timeoutMs && timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      if (timeoutTimer !== null) clearTimeout(timeoutTimer);
      callerSignal?.removeEventListener('abort', forwardAbort);
    },
  };
};
const appendQueryParams = (url: URL, query: TarkovApiRequestOptions['query']): void => {
  if (!query) return;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
};
export const buildTarkovApiUrl = (
  endpoint: string,
  query?: TarkovApiRequestOptions['query']
): string => {
  const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(endpoint, base);
  appendQueryParams(url, query);
  return url.toString();
};
/** True when Cloudflare mitigated the response with an interactive challenge. */
export const isChallengeMitigated = (response: Response): boolean =>
  (response.headers.get(CHALLENGE_MITIGATION_HEADER) ?? '').trim().toLowerCase() ===
  CHALLENGE_MITIGATION_VALUE;
const readStatusBodySnippet = async (response: Response): Promise<string> => {
  try {
    return truncateBodySnippet((await response.text()).trim());
  } catch {
    return '';
  }
};
const buildRequestBody = (body: unknown): string | undefined => {
  if (body === undefined) return undefined;
  if (typeof body === 'string') return body;
  return JSON.stringify(body);
};
const buildRequestHeaders = (options: TarkovApiRequestOptions): Record<string, string> =>
  options.body === undefined
    ? (options.headers ?? {})
    : { 'content-type': 'application/json', ...(options.headers ?? {}) };
/**
 * Runs one raw request attempt. Callers must consult the response headers
 * (mitigation markers, status) BEFORE reading the body: read the payload with
 * `readTarkovApiJson` only after `isChallengeMitigated` returned false.
 */
export const rawTarkovRequest = async (
  endpoint: string,
  options: TarkovApiRequestOptions
): Promise<Response> => {
  const linked = createLinkedRequestAbort(options.signal, options.timeout);
  try {
    const response = await fetch(buildTarkovApiUrl(endpoint, options.query), {
      method: options.method ?? 'GET',
      headers: buildRequestHeaders(options),
      body: buildRequestBody(options.body),
      signal: linked.signal,
      ...(options.cache ? { cache: options.cache } : {}),
    });
    if (isChallengeMitigated(response)) return response;
    const body = await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (cause) {
    if (linked.didTimeout()) {
      const timeoutError = new Error(`Tarkov API request to ${endpoint} timed out`, { cause });
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    if (options.signal?.aborted) throw createAbortError(options.signal.reason);
    throw toError(cause);
  } finally {
    linked.dispose();
  }
};
export const readTarkovApiJson = async <T>(response: Response, endpoint: string): Promise<T> => {
  // Statuses and mitigation markers are resolved before the body is ever read.
  if (!response.ok) {
    throw new TarkovApiStatusError(response, endpoint, await readStatusBodySnippet(response));
  }
  const body = await response.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new TarkovApiInvalidResponseError(endpoint, truncateBodySnippet(body.trim()));
  }
};
let browserConfig: TarkovAccessRuntimeConfig | null = null;
const tryReadPublicRuntimeConfig = (): TarkovAccessRuntimeConfig | null => {
  try {
    const config = useRuntimeConfig().public as unknown as TarkovAccessRuntimeConfig;
    if (import.meta.client) browserConfig = config;
    return config;
  } catch {
    // Store actions may resume outside Nuxt's synchronous setup context. The root
    // gate captures public config before any data requests can start.
    return browserConfig;
  }
};
export const isTarkovAccessEnabled = (): boolean => {
  const config = tryReadPublicRuntimeConfig();
  return config?.tarkovAccessEnabled === true || config?.tarkovAccessEnabled === 'true';
};
export const resolveTarkovAccessSiteKey = (): string =>
  tryReadPublicRuntimeConfig()?.tarkovAccessSiteKey?.trim() ?? '';
interface ProbeVerdict {
  kind: 'released' | 'challenge' | 'blocked' | 'rate_limited' | 'failed';
  status?: number;
  error?: Error;
}
/** Reactive controller state, exposed to the retry UI through `useTarkovAccess`. */
const accessState = {
  phase: ref<TarkovAccessPhase>('idle'),
  /** Bumped per flow so the widget resets exactly once per attempt. */
  attemptEpoch: ref(0),
  /** True once an attempt consumed its verification token without release. */
  attemptsExhausted: ref(false),
  lastError: ref<Error | null>(null),
  /** True after the first challenge of the session; it gates retry-UI visibility. */
  challengeSeen: ref(false),
  /** True while a dismissal latches; the gate offers a non-modal way back. */
  dismissed: ref(false),
  /** Epoch ms before which a rate-limited verification should not be retried. */
  retryAvailableAt: ref(0),
  /** Bumped by the first release after a dismissal, so consumers it failed can reload. */
  recoveryEpoch: ref(0),
};
interface AccessFlow {
  readonly id: number;
  readonly startGeneration: number;
  readonly run: Promise<void>;
}
/**
 * Reactive controller state accessor; the composable facade re-exports these
 * to the retry UI. Treat as immutable — resets go through the reset helper.
 */
export const getTarkovAccessState = (): typeof accessState => accessState;
let generation = 0;
let releasedGeneration = -1;
let flowIdCounter = 0;
let flow: AccessFlow | null = null;
const gateTokenWaiters = new Map<number, (token: string | null) => void>();
interface RetryWaiter {
  resume: (next: AccessFlow) => void;
  abandon: (failure: Error) => void;
}
let retryWaiter: RetryWaiter | null = null;
let retryPromise: Promise<AccessFlow> | null = null;
const dismissedFlows = new Set<number>();
/** Latched by a dismissal so later requests fail fast instead of reopening the gate. */
let dismissedFailure: TarkovAccessError | null = null;
/** True while a challenged flow's failure waits for the visible manual retry. */
let parked = false;
/** Latched by a dismissal until access is next released. */
let recoveryPending = false;
const parkedFailures = new WeakSet<Error>();
const markParked = (failure: TarkovAccessError): TarkovAccessError => {
  parked = true;
  parkedFailures.add(failure);
  return failure;
};
const waitForManualRetry = (): Promise<AccessFlow> => {
  retryPromise ??= new Promise<AccessFlow>((resume, abandon) => {
    retryWaiter = { resume, abandon };
  });
  return retryPromise;
};
const takeRetryWaiter = (): RetryWaiter | null => {
  const waiter = retryWaiter;
  retryWaiter = null;
  retryPromise = null;
  return waiter;
};
const awaitAccessFlow = async (entry: AccessFlow): Promise<number> => {
  try {
    await entry.run;
    return entry.startGeneration;
  } catch (error) {
    if (!(error instanceof Error) || !parkedFailures.has(error)) throw error;
    return awaitAccessFlow(await waitForManualRetry());
  }
};
const isAccessCurrent = (): boolean => releasedGeneration === generation;
const classifyProbeFailure = (status: number): ProbeVerdict => {
  if (status === 429) return { kind: 'rate_limited', status };
  if (status >= 500) return { kind: 'failed', status };
  return { kind: 'blocked', status };
};
const probeAccess = async (): Promise<ProbeVerdict> => {
  if (!import.meta.client)
    return { kind: 'failed', error: new Error('Access check is client-only') };
  try {
    const response = await rawTarkovRequest(ACCESS_CHECK_ENDPOINT, {
      cache: 'no-store',
      timeout: ACCESS_CHECK_TIMEOUT_MS,
    });
    if (isChallengeMitigated(response)) return { kind: 'challenge' };
    if (!response.ok) return classifyProbeFailure(response.status);
    return { kind: 'released' };
  } catch (cause) {
    return { kind: 'failed', error: toError(cause) };
  }
};
const verifyAccessToken = async (token: string): Promise<void> => {
  const response = await rawTarkovRequest(TARKOV_VERIFY_ENDPOINT, {
    method: 'POST',
    body: { token },
    timeout: SITEVERIFY_TIMEOUT_MS,
    cache: 'no-store',
  });
  if (isChallengeMitigated(response)) {
    throw new TarkovAccessError('challenge', 'The security verification itself was challenged.');
  }
  if (!response.ok) {
    // Body content is deliberately excluded: verification failures must never
    // echo the token back into messages or logs.
    throw new TarkovApiStatusError(response, TARKOV_VERIFY_ENDPOINT, '');
  }
};
const toAccessFailure = (verdict: ProbeVerdict): TarkovAccessError => {
  switch (verdict.kind) {
    case 'blocked':
      return new TarkovAccessError(
        'blocked',
        `Access check is unavailable (status ${verdict.status}).`
      );
    case 'rate_limited':
      return new TarkovAccessError('rate_limited', 'The access check was rate limited.');
    default:
      return new TarkovAccessError(
        'failed',
        verdict.status
          ? `The access check failed (status ${verdict.status}).`
          : 'The access check failed.',
        verdict.error
      );
  }
};
const announceRecovery = (): void => {
  if (!recoveryPending) return;
  recoveryPending = false;
  accessState.recoveryEpoch.value += 1;
};
const settleAccessVerdict = (
  verdict: ProbeVerdict,
  startGeneration: number,
  reachedChallenge: boolean
): TarkovAccessError | null => {
  if (verdict.kind === 'released') {
    releasedGeneration = startGeneration;
    accessState.phase.value = 'released';
    announceRecovery();
    return null;
  }
  const failure = toAccessFailure(verdict);
  accessState.lastError.value = failure;
  if (!reachedChallenge) {
    accessState.phase.value = 'idle';
    return failure;
  }
  accessState.phase.value = verdict.kind;
  return markParked(failure);
};
/**
 * Parks the attempt after its one verification token was consumed or lost:
 * release requires a manual retry, and no tokens are requested automatically.
 */
const parkAccessAttempt = (cause?: Error): TarkovAccessError => {
  const failure = new TarkovAccessError(
    'challenge_exhausted',
    'The security check did not release data access.',
    cause
  );
  accessState.attemptsExhausted.value = true;
  accessState.phase.value = 'challenge';
  accessState.lastError.value = failure;
  logger.warn('[TarkovAccess] Security check attempt parked; manual retry is required');
  return markParked(failure);
};
const RETRY_AFTER_FALLBACK_SECONDS = 60;
const RETRY_AFTER_MAX_SECONDS = 300;
const readRetryAfterMs = (response: Response): number => {
  const seconds = Number(response.headers.get('retry-after'));
  const delay = Number.isFinite(seconds) && seconds > 0 ? seconds : RETRY_AFTER_FALLBACK_SECONDS;
  return Math.min(delay, RETRY_AFTER_MAX_SECONDS) * 1000;
};
/**
 * A rate-limited verification parks with the rate-limit copy and the server's
 * delay, so the retry UI does not invite an immediate, doomed resubmission.
 */
const parkVerificationFailure = (cause: unknown): TarkovAccessError => {
  if (!(cause instanceof TarkovApiStatusError) || cause.status !== 429) {
    return parkAccessAttempt(toError(cause));
  }
  const failure = new TarkovAccessError(
    'rate_limited',
    'Security verification was rate limited.',
    cause
  );
  accessState.retryAvailableAt.value = Date.now() + readRetryAfterMs(cause.response);
  accessState.attemptsExhausted.value = true;
  accessState.phase.value = 'rate_limited';
  accessState.lastError.value = failure;
  return markParked(failure);
};
/** Ends a challenged attempt the user dismissed: waiters reject and the gate hides. */
const dismissAccessAttempt = (): TarkovAccessError => {
  const failure = new TarkovAccessError('challenge', 'The security check was dismissed.');
  dismissedFailure = failure;
  recoveryPending = true;
  accessState.dismissed.value = true;
  accessState.phase.value = 'idle';
  accessState.lastError.value = failure;
  return failure;
};
const failWithoutToken = (flowId: number): TarkovAccessError =>
  dismissedFlows.delete(flowId) ? dismissAccessAttempt() : parkAccessAttempt();
const settleOrThrow = (
  verdict: ProbeVerdict,
  startGeneration: number,
  reachedChallenge: boolean
): void => {
  const failure = settleAccessVerdict(verdict, startGeneration, reachedChallenge);
  if (failure) throw failure;
};
/**
 * A flow resuming parked waiters settles as challenged, so its ordinary
 * failure keeps the visible retry instead of silently rejecting them.
 */
const executeAccessFlow = async (
  flowId: number,
  startGeneration: number,
  resumesParked: boolean
): Promise<void> => {
  const firstVerdict = await probeAccess();
  if (firstVerdict.kind !== 'challenge') {
    settleOrThrow(firstVerdict, startGeneration, resumesParked);
    return;
  }
  accessState.challengeSeen.value = true;
  accessState.phase.value = 'challenge';
  const token = await waitForGateToken(flowId);
  if (!token) throw failWithoutToken(flowId);
  accessState.phase.value = 'verifying';
  try {
    await verifyAccessToken(token);
    logger.debug('[TarkovAccess] Siteverify accepted the check token; re-probing');
  } catch (cause) {
    throw parkVerificationFailure(cause);
  }
  const reprobeVerdict = await probeAccess();
  if (reprobeVerdict.kind === 'challenge') throw parkAccessAttempt();
  settleOrThrow(reprobeVerdict, startGeneration, true);
};
const settleFlow = (entry: { id: number }): void => {
  if (flow && flow.id === entry.id) flow = null;
};
const startAccessFlow = (resumesParked = false): AccessFlow => {
  const flowId = ++flowIdCounter;
  const startGeneration = ++generation;
  parked = false;
  accessState.attemptEpoch.value = flowId;
  accessState.attemptsExhausted.value = false;
  accessState.lastError.value = null;
  accessState.phase.value = 'probing';
  const run = (async () => {
    try {
      await executeAccessFlow(flowId, startGeneration, resumesParked);
    } finally {
      settleFlow({ id: flowId });
    }
  })();
  const entry = { id: flowId, startGeneration, run };
  flow = entry;
  // Shared flows resolve through waiters; keep a no-op consumer so a flow that
  // settles without waiters can never raise an unhandled rejection.
  run.catch(() => {});
  return entry;
};
const waitForGateToken = (flowId: number): Promise<string | null> =>
  new Promise<string | null>((resolveToken) => {
    gateTokenWaiters.set(flowId, resolveToken);
  });
export const submitGateToken = (token: string): void => {
  const activeFlowId = flow?.id ?? 0;
  const resolveToken = gateTokenWaiters.get(activeFlowId);
  if (!resolveToken) return;
  gateTokenWaiters.delete(activeFlowId);
  resolveToken(token);
};
export const reportGateWidgetUnavailable = (): void => {
  const activeFlowId = flow?.id ?? 0;
  const resolveToken = gateTokenWaiters.get(activeFlowId);
  if (!resolveToken) return;
  gateTokenWaiters.delete(activeFlowId);
  resolveToken(null);
};
/**
 * Waits for a shared flow result, but fails fast when the caller's own signal
 * aborts. The shared flow is NOT cancelled and keeps serving other waiters;
 * listeners are detached once either side settles.
 */
export const abandonSharedWait = <T>(sharedRun: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return sharedRun;
  if (signal.aborted) return Promise.reject(createAbortError(signal.reason));
  return new Promise<T>((resolveWait, rejectWait) => {
    const forwardAbandon = (): void => {
      removeAbandon();
      rejectWait(createAbortError(signal.reason));
    };
    const removeAbandon = (): void => {
      signal.removeEventListener('abort', forwardAbandon);
    };
    signal.addEventListener('abort', forwardAbandon);
    void sharedRun.then(
      (result) => {
        removeAbandon();
        resolveWait(result);
      },
      (cause: unknown) => {
        removeAbandon();
        rejectWait(toError(cause));
      }
    );
  });
};
/**
 * Joins the in-flight flow, waits behind a parked flow's manual retry, or
 * starts a fresh flow when the previous one ended without parking.
 */
const joinAccessFlow = (): Promise<number> => {
  if (dismissedFailure) return Promise.reject(dismissedFailure);
  if (!flow && parked) return waitForManualRetry().then(awaitAccessFlow);
  return awaitAccessFlow(flow ?? startAccessFlow());
};
/**
 * Ensures the shared probe has released before any data request proceeds.
 * Resolves immediately when disabled, released at the current generation, or
 * joined to an in-flight flow (single-flight). Caller cancellation only ends
 * the caller's wait.
 */
export const ensureTarkovAccess = async (signal?: AbortSignal): Promise<number> => {
  if (!isTarkovAccessEnabled()) return 0;
  if (signal?.aborted) throw createAbortError(signal.reason);
  if (isAccessCurrent()) return releasedGeneration;
  return abandonSharedWait(joinAccessFlow(), signal);
};
/**
 * Renews access for a data request that met a late challenge at its own
 * generation. Concurrent late challenges converge: the first caller starts the
 * renewal flow, everyone else joins it — exactly one renewal per generation.
 */
export const renewTarkovAccess = async (
  fromGeneration: number,
  signal?: AbortSignal
): Promise<void> => {
  if (!isTarkovAccessEnabled()) return;
  // A release AT the caller's generation is the initial release, not a renewal;
  // only a strictly newer release means another wait already renewed for us.
  if (releasedGeneration > fromGeneration) return;
  await abandonSharedWait(joinAccessFlow(), signal);
};
/** Manual retry from the gate UI: never automatic, joins an in-flight flow. */
export const requestGateRetry = async (signal?: AbortSignal): Promise<void> => {
  if (!isTarkovAccessEnabled()) return;
  if (signal?.aborted) throw createAbortError(signal.reason);
  if (flow) {
    await abandonSharedWait(flow.run, signal);
    return;
  }
  dismissedFailure = null;
  accessState.dismissed.value = false;
  if (isAccessCurrent()) return;
  const retried = startAccessFlow(parked);
  takeRetryWaiter()?.resume(retried);
  await abandonSharedWait(retried.run, signal);
};
/**
 * Closes the gate without clearance: a pending challenge or parked failure
 * rejects its waiters and the gate hides. Later requests fail fast with the
 * same error until the gate's non-modal verify action retries.
 */
export const dismissTarkovAccessGate = (): void => {
  const activeFlowId = flow?.id ?? 0;
  if (gateTokenWaiters.has(activeFlowId)) {
    dismissedFlows.add(activeFlowId);
    reportGateWidgetUnavailable();
    return;
  }
  if (flow || !parked) return;
  parked = false;
  takeRetryWaiter()?.abandon(dismissAccessAttempt());
};
/** Resets module state between tests; production code must not call this. */
export const resetTarkovAccessForTests = (): void => {
  for (const [flowId, resolveToken] of gateTokenWaiters) {
    gateTokenWaiters.delete(flowId);
    resolveToken(null);
  }
  flow = null;
  takeRetryWaiter();
  dismissedFlows.clear();
  dismissedFailure = null;
  accessState.dismissed.value = false;
  accessState.retryAvailableAt.value = 0;
  accessState.recoveryEpoch.value = 0;
  recoveryPending = false;
  parked = false;
  generation = 0;
  browserConfig = null;
  releasedGeneration = -1;
  flowIdCounter = 0;
  accessState.phase.value = 'idle';
  accessState.attemptEpoch.value = 0;
  accessState.attemptsExhausted.value = false;
  accessState.lastError.value = null;
  accessState.challengeSeen.value = false;
};
/** ofetch's default transient statuses; challenged responses are never retried here. */
const TRANSIENT_RETRY_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
/** Mirrors ofetch: one retry for GET unless `retry` is given, none for payload methods. */
const resolveRetryBudget = (options: TarkovApiRequestOptions): number => {
  if (typeof options.retry === 'number') return options.retry;
  return (options.method ?? 'GET') === 'GET' ? 1 : 0;
};
const shouldRetryResponse = (response: Response, retriesLeft: number): boolean =>
  retriesLeft > 0 &&
  !isChallengeMitigated(response) &&
  TRANSIENT_RETRY_STATUSES.has(response.status);
/**
 * Keeps the disabled `$fetch` transient retry for the gated transport:
 * network failures, attempt timeouts and transient statuses retry within the
 * budget, while caller cancellation never retries.
 */
const requestWithTransientRetry = async (
  endpoint: string,
  options: TarkovApiRequestOptions,
  retriesLeft = resolveRetryBudget(options)
): Promise<Response> => {
  let response: Response;
  try {
    response = await rawTarkovRequest(endpoint, options);
  } catch (cause) {
    if (retriesLeft <= 0 || options.signal?.aborted) throw cause;
    return requestWithTransientRetry(endpoint, options, retriesLeft - 1);
  }
  if (!shouldRetryResponse(response, retriesLeft)) return response;
  return requestWithTransientRetry(endpoint, options, retriesLeft - 1);
};
const renewOnceAndRetry = async (
  endpoint: string,
  options: TarkovApiRequestOptions,
  fromGeneration: number
): Promise<Response> => {
  await renewTarkovAccess(fromGeneration, options.signal);
  const retriedResponse = await requestWithTransientRetry(endpoint, options);
  if (isChallengeMitigated(retriedResponse)) {
    throw new TarkovAccessError(
      'challenge_exhausted',
      `The security check stayed active after one retry of ${endpoint}.`
    );
  }
  return retriedResponse;
};
/**
 * Fetches a Tarkov metadata endpoint. With the access feature disabled the
 * call is a strict pass-through to `$fetch`, preserving existing fetch mocks
 * and policies. With the feature enabled the request waits for the shared
 * probe, detects Cloudflare challenges from the raw response before parsing,
 * and retries once after a successful renewal.
 */
export const tarkovApiFetch = async <T>(
  endpoint: string,
  options: TarkovApiRequestOptions = {}
): Promise<T> => {
  if (!isTarkovAccessEnabled()) {
    type OfetchFetchOptions = Parameters<typeof $fetch>[1];
    return await $fetch<T>(endpoint, options as OfetchFetchOptions);
  }
  if (options.signal?.aborted) throw createAbortError(options.signal.reason);
  const fromGeneration = await ensureTarkovAccess(options.signal);
  let response = await requestWithTransientRetry(endpoint, options);
  if (isChallengeMitigated(response)) {
    response = await renewOnceAndRetry(endpoint, options, fromGeneration);
  }
  return await readTarkovApiJson<T>(response, endpoint);
};
