import type { TarkovItemsQueryResult } from '~/types/tarkov';
import { edgeCache } from '~/server/utils/edgeCache';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { CACHE_TTL_EXTENDED } from '~/server/utils/tarkov-cache-config';
import { createValidatedTarkovProxyFetcher } from '~/server/utils/tarkov-proxy';
import { TARKOV_ITEMS_LITE_QUERY } from '~/server/utils/tarkov-queries';
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const lang = getValidatedLanguage(query);
  const cacheKey = `items-lite-${lang}`;
  const fetcher = createValidatedTarkovProxyFetcher<TarkovItemsQueryResult>(
    'TarkovItemsLite',
    TARKOV_ITEMS_LITE_QUERY,
    { lang }
  );
  return edgeCache(event, cacheKey, fetcher, CACHE_TTL_EXTENDED, {
    cacheKeyPrefix: 'tarkov',
  });
});
