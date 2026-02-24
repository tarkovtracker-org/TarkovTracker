import type { TarkovGraphqlResponse } from '~/server/utils/graphql-validation';
import { validateAndThrow } from '~/server/utils/graphql-validation';
import { createLogger } from '~/server/utils/logger';
import { createTarkovFetcher } from '~/server/utils/tarkovFetcher';
type ProxyFetcherOptions<TData, TOutput> = {
  allowPartialData?: boolean;
  mapResponse?: (response: TarkovGraphqlResponse<TData> & { data: TData }) => TOutput;
};
export function createValidatedTarkovProxyFetcher<TData, TOutput = TarkovGraphqlResponse<TData>>(
  loggerName: string,
  query: string,
  variables: Record<string, unknown> = {},
  options: ProxyFetcherOptions<TData, TOutput> = {}
): () => Promise<TOutput> {
  const { allowPartialData = true, mapResponse } = options;
  const logger = createLogger(loggerName);
  const baseFetcher = createTarkovFetcher<TarkovGraphqlResponse<TData>>(query, variables);
  return async () => {
    const response = await baseFetcher();
    validateAndThrow<TData>(response, logger, allowPartialData);
    if (mapResponse) {
      return mapResponse(response);
    }
    return response as unknown as TOutput;
  };
}
