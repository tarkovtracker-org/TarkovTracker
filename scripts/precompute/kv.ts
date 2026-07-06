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
      let response: Response;
      try {
        response = await fetch(url, {
          body: value,
          headers: {
            Authorization: `Bearer ${config.apiToken}`,
            'Content-Type': 'text/plain',
          },
          method: 'PUT',
          signal: AbortSignal.timeout(KV_WRITE_TIMEOUT_MS),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`KV write failed for "${key}": ${reason}`, {
          cause: error,
        });
      }
      const body = (await response.json().catch(() => null)) as CloudflareApiResponse | null;
      if (!response.ok || body?.success !== true) {
        const detail =
          body?.errors
            ?.map((error) => `${error.code ?? '?'}: ${error.message ?? '?'}`)
            .join('; ') || `HTTP ${response.status}`;
        throw new Error(`KV write failed for "${key}": ${detail}`);
      }
    },
  };
}
