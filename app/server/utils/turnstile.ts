import { createLogger } from '@/server/utils/logger';
const logger = createLogger('Turnstile');
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const SITEVERIFY_TIMEOUT_MS = 5000;
export type TurnstileVerification =
  { ok: true } | { ok: false; reason: 'missing-token' | 'invalid-token' | 'hostname-mismatch' };
type SiteverifyResponse = {
  success?: boolean;
  hostname?: string;
  'error-codes'?: string[];
};
const isSiteverifyResponse = (value: unknown): value is SiteverifyResponse => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if ('success' in candidate && typeof candidate.success !== 'boolean') return false;
  if ('hostname' in candidate && typeof candidate.hostname !== 'string') return false;
  if (
    'error-codes' in candidate &&
    (!Array.isArray(candidate['error-codes']) ||
      !candidate['error-codes'].every((code) => typeof code === 'string'))
  ) {
    return false;
  }
  return true;
};
const isAllowedHostname = (hostname: string | undefined, allowedHostnames: string[]): boolean => {
  if (allowedHostnames.length === 0) return true;
  if (!hostname) return false;
  const normalized = hostname.toLowerCase();
  return allowedHostnames.some((allowed) => normalized === allowed);
};
export const verifyTurnstileToken = async (options: {
  secretKey: string;
  token: string | null | undefined;
  allowedHostnames?: string[];
  remoteIp?: string | null;
}): Promise<TurnstileVerification> => {
  // NOTE: legacy profile-import verifier. Siteverify transport/server/malformed-response
  // failures fail OPEN here (Turnstile is an abuse gate for this route, not an integrity
  // boundary). The strict verifier below must not change this contract.
  const token = options.token?.trim() ?? '';
  if (!token) {
    return { ok: false, reason: 'missing-token' };
  }
  if (token.length > 2048) {
    return { ok: false, reason: 'invalid-token' };
  }
  const requestBody = new URLSearchParams({ secret: options.secretKey, response: token });
  if (options.remoteIp) {
    requestBody.set('remoteip', options.remoteIp);
  }
  let parsedPayload: unknown;
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body: requestBody,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`siteverify responded ${response.status}`);
    }
    parsedPayload = (await response.json()) as unknown;
  } catch (error) {
    // siteverify outages fail open: Turnstile is an abuse gate, not an integrity boundary.
    logger.warn('Turnstile siteverify unavailable; allowing request', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: true };
  }
  if (!isSiteverifyResponse(parsedPayload)) {
    return { ok: false, reason: 'invalid-token' };
  }
  const payload = parsedPayload;
  if (payload.success !== true) {
    return { ok: false, reason: 'invalid-token' };
  }
  if (!isAllowedHostname(payload.hostname, options.allowedHostnames ?? [])) {
    return { ok: false, reason: 'hostname-mismatch' };
  }
  return { ok: true };
};
// --- Strict verifier for the Tarkov data browser-clearance handoff ----------------------
//
// POST /api/security/tarkov-verify validates tokens but mints no clearance.
// Verification must be strict where the legacy verifier
// above deliberately fails open:
// - success requires `success === true`, the exact expected hostname, and the expected
//   widget action;
// - siteverify transport errors, non-2xx responses, and undecodable/malformed success
//   payloads are reported as `siteverify-unavailable`/`siteverify-malformed` so the
//   endpoint can fail CLOSED with an explicit 503 instead of silently allowing.
export const TARKOV_DATA_ACCESS_ACTION = 'tarkov_data_access';
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;
const REPLAYED_ERROR_CODE = 'timeout-or-duplicate';
const EXPIRED_ERROR_CODE = 'expired-token';
export type StrictTurnstileFailureReason =
  | 'missing-token'
  | 'oversized-token'
  | 'replayed-token'
  | 'expired-token'
  | 'invalid-token'
  | 'action-mismatch'
  | 'hostname-mismatch'
  | 'siteverify-malformed'
  | 'siteverify-unavailable';
export type StrictTurnstileVerification =
  { ok: true } | { ok: false; reason: StrictTurnstileFailureReason };
type StrictSiteverifyOutcome = { unavailable: true } | { unavailable: false; payload: unknown };
type StrictSiteverifyResult =
  | { outcome: 'success'; hostname: string; action: string }
  | { outcome: 'rejected'; errorCodes: string[] }
  | { outcome: 'malformed' }
  | { outcome: 'unavailable' };
const isSiteverifyObject = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};
const parseTurnstileErrorCodes = (value: unknown): string[] => {
  return Array.isArray(value) && value.every((code) => typeof code === 'string')
    ? (value as string[])
    : [];
};
// A siteverify field that is absent is normalized to '' (Cloudflare omits the action
// field when none was bound); a field present with a non-string type means the upstream
// response no longer matches the documented contract.
const normalizeSiteverifyStringField = (value: unknown): string | null => {
  if (value === undefined) return '';
  return typeof value === 'string' ? value : null;
};
// Strict payload shape for the strict verifier. Hostname/action/error-codes stay
// `unknown` because `parseStrictSiteverify` validates them dynamically; `action` MUST be
// declared or every later `payload.action` access fails to compile.
type StrictSiteverifyPayload = {
  success: boolean;
  hostname?: unknown;
  action?: unknown;
  'error-codes'?: unknown;
};
const isStrictSiteverifyShape = (value: unknown): value is StrictSiteverifyPayload => {
  return isSiteverifyObject(value) && typeof (value as { success?: unknown }).success === 'boolean';
};
const parseStrictSiteverify = (payload: unknown): StrictSiteverifyResult => {
  if (!isStrictSiteverifyShape(payload)) return { outcome: 'malformed' };
  if (!payload.success) {
    return { outcome: 'rejected', errorCodes: parseTurnstileErrorCodes(payload['error-codes']) };
  }
  const hostname = normalizeSiteverifyStringField(payload.hostname);
  const action = normalizeSiteverifyStringField(payload.action);
  return hostname !== null && action !== null
    ? { outcome: 'success', hostname, action }
    : { outcome: 'malformed' };
};
const postSiteverifyStrict = async (
  requestBody: URLSearchParams
): Promise<StrictSiteverifyOutcome> => {
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body: requestBody,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { unavailable: true };
    }
    const text = await response.text();
    try {
      return { unavailable: false, payload: JSON.parse(text) as unknown };
    } catch {
      return { unavailable: true };
    }
  } catch {
    return { unavailable: true };
  }
};
// A wrong or missing deployed secret is a service fault, not a bad visitor token.
const UNAVAILABLE_ERROR_CODES = new Set([
  'internal-error',
  'invalid-input-secret',
  'missing-input-secret',
]);
const classifySiteverifyRejection = (errorCodes: string[]): StrictTurnstileFailureReason => {
  if (errorCodes.some((code) => UNAVAILABLE_ERROR_CODES.has(code))) return 'siteverify-unavailable';
  if (errorCodes.includes(REPLAYED_ERROR_CODE)) return 'replayed-token';
  if (errorCodes.includes(EXPIRED_ERROR_CODE)) return 'expired-token';
  return 'invalid-token';
};
// Siteverify evaluated the token but its context does not match this deployment: hostname
// pinning (exact matches only, empty allowlist rejects) and the widget action bound
// at render time.
const rejectUnmatchedSiteverifyContext = (
  hostname: string,
  allowedHostnames: string[],
  action: string,
  expectedAction: string
): StrictTurnstileFailureReason | null => {
  if (!allowedHostnames.length || !isAllowedHostname(hostname, allowedHostnames)) {
    return 'hostname-mismatch';
  }
  return action === expectedAction ? null : 'action-mismatch';
};
const resolveStrictPrecheckFailure = (token: string): StrictTurnstileFailureReason | null => {
  if (!token) return 'missing-token';
  return token.length > MAX_TURNSTILE_TOKEN_LENGTH ? 'oversized-token' : null;
};
const classifyStrictSiteverify = (
  siteverify: StrictSiteverifyResult,
  expectedHostnames: string[],
  expectedAction: string
): StrictTurnstileVerification => {
  if (siteverify.outcome === 'unavailable') return { ok: false, reason: 'siteverify-unavailable' };
  if (siteverify.outcome === 'malformed') return { ok: false, reason: 'siteverify-malformed' };
  if (siteverify.outcome === 'rejected') {
    return { ok: false, reason: classifySiteverifyRejection(siteverify.errorCodes) };
  }
  const contextFailure = rejectUnmatchedSiteverifyContext(
    siteverify.hostname,
    expectedHostnames,
    siteverify.action,
    expectedAction
  );
  return contextFailure ? { ok: false, reason: contextFailure } : { ok: true };
};
/**
 * Strict Turnstile verifier for POST /api/security/tarkov-verify (Tarkov data access
 * clearance). Unlike the legacy profile-import verifier above, every rejection here
 * fails closed: `siteverify-unavailable` (transport/server/unparseable upstream) and
 * `siteverify-malformed` (unusable successful payload) surface as explicit 503s.
 * Callers are responsible for providing a non-empty exact `expectedHostnames` allowlist
 * and the expected widget action before gating access on the result.
 */
export const verifyTurnstileTokenStrict = async (options: {
  secretKey: string;
  token: string | null | undefined;
  expectedAction: string;
  expectedHostnames: string[];
  remoteIp?: string | null;
}): Promise<StrictTurnstileVerification> => {
  const token = options.token?.trim() ?? '';
  const precheckFailure = resolveStrictPrecheckFailure(token);
  if (precheckFailure) return { ok: false, reason: precheckFailure };
  const requestBody = new URLSearchParams({ secret: options.secretKey, response: token });
  if (options.remoteIp) {
    requestBody.set('remoteip', options.remoteIp);
  }
  const siteverify = await postSiteverifyStrict(requestBody);
  const parsed = siteverify.unavailable
    ? ({ outcome: 'unavailable' } satisfies StrictSiteverifyResult)
    : parseStrictSiteverify(siteverify.payload);
  return classifyStrictSiteverify(parsed, options.expectedHostnames, options.expectedAction);
};
