import { $fetch } from 'ofetch';
import { sanitizeGraphQLErrors, sanitizeVariables } from '@/server/utils/edgeCacheSanitizers';
import { createLogger } from '@/server/utils/logger';
const logger = createLogger('TarkovFetcher');
type TarkovGraphqlRequest = {
  method: 'POST';
  headers: {
    'Content-Type': string;
  };
  body: {
    query: string;
    variables: Record<string, unknown>;
  };
  timeout: number;
  retry: number;
};
type TarkovFetcherRequest = <T = unknown>(url: string, request: TarkovGraphqlRequest) => Promise<T>;
type TarkovFetcherDependencies = {
  fetcher?: TarkovFetcherRequest;
  logger?: Pick<typeof logger, 'error' | 'warn'>;
  sleep?: (ms: number) => Promise<void>;
};
type TarkovFetcherOptions = {
  maxRetries?: number;
  timeoutMs?: number;
  deps?: TarkovFetcherDependencies;
};
export function createTarkovFetcher<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
  options: TarkovFetcherOptions = {}
): () => Promise<T> {
  const { maxRetries = 3, timeoutMs = 30000, deps } = options;
  const fetcher = deps?.fetcher ?? ($fetch as TarkovFetcherRequest);
  const fetcherLogger = deps?.logger ?? logger;
  const sleep = deps?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const safeMaxRetries = Number.isFinite(maxRetries) ? Math.max(1, Math.floor(maxRetries)) : 3;
  const safeTimeoutMs = Number.isFinite(timeoutMs) ? Math.max(1000, Math.floor(timeoutMs)) : 30000;
  return async () => {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= safeMaxRetries; attempt++) {
      try {
        const response = await fetcher<T>('https://api.tarkov.dev/graphql', {
          method: 'POST' as const,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            query,
            variables,
          },
          timeout: safeTimeoutMs,
          retry: 0,
        });
        if (response && typeof response === 'object' && 'errors' in response) {
          const responseErrors = (response as { errors?: unknown }).errors;
          if (Array.isArray(responseErrors)) {
            throw new Error(`GraphQL errors: ${sanitizeGraphQLErrors(responseErrors)}`);
          }
          throw new Error(
            `GraphQL response contained non-array errors (${typeof responseErrors}): ${sanitizeGraphQLErrors(responseErrors)}`
          );
        }
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isLastAttempt = attempt === safeMaxRetries;
        if (isLastAttempt) {
          fetcherLogger.error(`[TarkovFetcher] All ${safeMaxRetries} attempts failed`, {
            error: lastError.message,
            variables: sanitizeVariables(variables),
          });
        } else {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          fetcherLogger.warn(
            `[TarkovFetcher] Attempt ${attempt}/${safeMaxRetries} failed, retrying in ${delayMs}ms`,
            { error: lastError.message }
          );
          await sleep(delayMs);
        }
      }
    }
    throw lastError || new Error('All fetch attempts failed');
  };
}
