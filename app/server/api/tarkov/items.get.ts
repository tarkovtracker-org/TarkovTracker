import type { TarkovItemsQueryResult } from '~/types/tarkov';
import { edgeCache } from '~/server/utils/edgeCache';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { CACHE_TTL_EXTENDED } from '~/server/utils/tarkov-cache-config';
import { createValidatedTarkovProxyFetcher } from '~/server/utils/tarkov-proxy';
import { TARKOV_ITEMS_QUERY } from '~/server/utils/tarkov-queries';
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const lang = getValidatedLanguage(query);
  const cacheKey = `items-${lang}`;
  const fetcher = createValidatedTarkovProxyFetcher<TarkovItemsQueryResult>(
    'TarkovItems',
    TARKOV_ITEMS_QUERY,
    { lang }
  );
  return await edgeCache(event, cacheKey, fetcher, CACHE_TTL_EXTENDED, {
    cacheKeyPrefix: 'tarkov',
  });
});
