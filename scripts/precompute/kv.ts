/**
 * Cloudflare KV writer backed by the REST API.
 *
 * The GitHub Actions runner has no Workers KV binding, so writes go through
 * `PUT /accounts/:account/storage/kv/namespaces/:namespace/values/:key`.
 * One request per key: the bulk endpoint's request-size ceiling cannot hold
 * all 32 ~4.2MB envelopes in one call, and per-key writes preserve the
 * per-combination failure isolation in runPrecompute.
 */
import type { KvWriter } from './precompute';
const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const KV_WRITE_TIMEOUT_MS = 30_000;
const KV_WRITE_ATTEMPTS = 3;
export type KvRestConfig = {
  accountId: string;
  apiToken: string;
  namespaceId: string;
};
type CloudflareApiResponse = {
  errors?: { code?: number; message?: string }[];
  success?: boolean;
};
export function createKvRestWriter(config: KvRestConfig): KvWriter {
  return {
    async put(key, value, options) {
      const url = new URL(
        `${CLOUDFLARE_API_BASE_URL}/accounts/${config.accountId}/storage/kv/namespaces/` +
          `${config.namespaceId}/values/${encodeURIComponent(key)}`
      );
      if (options?.expirationTtl !== undefined) {
        url.searchParams.set('expiration_ttl', String(options.expirationTtl));
      }
      await writeWithRetries(url, key, value, config.apiToken);
    },
  };
}
async function writeWithRetries(
  url: URL,
  key: string,
  value: string,
  apiToken: string
): Promise<void> {
  for (let attempt = 0; attempt < KV_WRITE_ATTEMPTS; attempt++) {
    const failure = await writeAttempt(url, key, value, apiToken);
    if (!failure) return;
    if (!failure.retryable || attempt === KV_WRITE_ATTEMPTS - 1) throw failure.error;
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
}
type WriteFailure = { error: Error; retryable: boolean };
async function writeAttempt(
  url: URL,
  key: string,
  value: string,
  apiToken: string
): Promise<WriteFailure | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      body: value,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'text/plain',
      },
      method: 'PUT',
      signal: AbortSignal.timeout(KV_WRITE_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      error: new Error(`KV write failed for "${key}": ${reason}`, { cause: error }),
      retryable: true,
    };
  }
  const body = (await response.json().catch(() => null)) as CloudflareApiResponse | null;
  if (response.ok && body?.success === true) return null;
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
  return (
    body?.errors?.map((error) => `${error.code ?? '?'}: ${error.message ?? '?'}`).join('; ') ||
    `HTTP ${response.status}`
  );
}
