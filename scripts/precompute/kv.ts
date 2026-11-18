/**
 * Cloudflare KV writer backed by the REST API.
 *
 * The GitHub Actions runner has no Workers KV binding, so writes go through
 * `PUT /accounts/:account/storage/kv/namespaces/:namespace/values/:key`.
 * One request per key: the bulk endpoint's request-size ceiling cannot hold
 * all 32 ~4.2MB envelopes in one call, and per-key writes preserve the
 * per-combination failure isolation in runPrecompute.
 */
const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const KV_TIMEOUT_MS = 30_000;
const KV_ATTEMPTS = 3;
export type KvRestConfig = {
  accountId: string;
  apiToken: string;
  namespaceId: string;
};
type CloudflareApiResponse = {
  errors?: { code?: number; message?: string }[];
  success?: boolean;
};
export type CatalogStore = {
  read: (key: string) => Promise<ArrayBuffer>;
  put: (
    key: string,
    value: string | Uint8Array<ArrayBuffer>,
    options?: { expirationTtl?: number }
  ) => Promise<void>;
};
export function createKvRestWriter(config: KvRestConfig): CatalogStore {
  const valueUrl = (key: string) =>
    new URL(
      CLOUDFLARE_API_BASE_URL +
        '/accounts/' +
        config.accountId +
        '/storage/kv/namespaces/' +
        config.namespaceId +
        '/values/' +
        encodeURIComponent(key)
    );
  return {
    read: (key) => retryKvOperation(() => readAttempt(valueUrl(key), key, config.apiToken)),
    async put(key, value, options) {
      const url = valueUrl(key);
      if (options?.expirationTtl !== undefined) {
        url.searchParams.set('expiration_ttl', String(options.expirationTtl));
      }
      await retryKvOperation(() => writeAttempt(url, key, value, config.apiToken));
    },
  };
}
export class KvReadNotFound extends Error {}
type KvFailure = { error: Error; retryable: boolean };
type Attempt<T> = { value: T } | KvFailure;
async function retryKvOperation<T>(operation: () => Promise<Attempt<T>>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const result = await operation();
    if ('value' in result) return result.value;
    if (isTerminalFailure(result, attempt)) throw result.error;
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
}
async function readAttempt(url: URL, key: string, apiToken: string): Promise<Attempt<ArrayBuffer>> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: 'Bearer ' + apiToken },
      signal: AbortSignal.timeout(KV_TIMEOUT_MS),
    });
    if (response.ok) return { value: await response.arrayBuffer() };
    const body = await readApiResponse(response);
    return {
      error: new (response.status === 404 ? KvReadNotFound : Error)(
        `KV read failed for "${key}": ${errorDetail(response, body)}`
      ),
      retryable: isTransientFailure(response, body) || response.status === 404,
    };
  } catch (error) {
    return { error: new Error(`KV read failed for "${key}"`, { cause: error }), retryable: true };
  }
}
function isTerminalFailure(failure: KvFailure, attempt: number): boolean {
  return !failure.retryable || attempt === KV_ATTEMPTS - 1;
}
function isSuccessfulWrite(response: Response, body: CloudflareApiResponse | null): boolean {
  return response.ok && body?.success === true;
}
async function writeAttempt(
  url: URL,
  key: string,
  value: string | Uint8Array<ArrayBuffer>,
  apiToken: string
): Promise<Attempt<void>> {
  let response: Response;
  let body: CloudflareApiResponse | null;
  try {
    response = await fetch(url, {
      body: value,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': typeof value === 'string' ? 'text/plain' : 'application/octet-stream',
      },
      method: 'PUT',
      signal: AbortSignal.timeout(KV_TIMEOUT_MS),
    });
    body = await readApiResponse(response);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      error: new Error(`KV write failed for "${key}": ${reason}`, { cause: error }),
      retryable: true,
    };
  }
  if (isSuccessfulWrite(response, body)) return { value: undefined };
  return {
    error: new Error(`KV write failed for "${key}": ${errorDetail(response, body)}`),
    retryable: isTransientFailure(response, body),
  };
}
function isTransientFailure(response: Response, body: CloudflareApiResponse | null): boolean {
  return response.status === 429 || response.status >= 500 || hasUnavailableError(body);
}
function hasUnavailableError(body: CloudflareApiResponse | null): boolean {
  return body?.errors?.some((error) => error.code === 7009) === true;
}
function errorDetail(response: Response, body: CloudflareApiResponse | null): string {
  return body?.errors?.map(formatApiError).join('; ') || `HTTP ${response.status}`;
}
function formatApiError(error: { code?: number; message?: string }): string {
  return `${error.code ?? '?'}: ${error.message ?? '?'}`;
}
async function readApiResponse(response: Response): Promise<CloudflareApiResponse | null> {
  try {
    return (await response.json()) as CloudflareApiResponse;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}
