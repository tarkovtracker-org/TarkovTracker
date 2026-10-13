import { defineEventHandler, getQuery, setResponseHeaders } from 'h3';
import { LRUCache } from 'lru-cache';
import { useRuntimeConfig } from '#imports';
import { createLogger } from '@/server/utils/logger';
import { TARKOVTRACKER_USER_AGENT } from '@/server/utils/userAgent';
const logger = createLogger('twitch-live');
const TWITCH_GQL_URL = 'https://gql.twitch.tv/gql';
const CACHE_TTL_MS = 60_000;
const LIVE_HEADERS = {
  'cache-control': 'public, max-age=30, s-maxage=60',
  'cloudflare-cdn-cache-control': 'public, max-age=30',
};
// Public status only: no event, Response, stream, or user data is retained.
// This is an isolate-local optimization, not a cross-region cache or billing bypass.
const liveCache = new LRUCache<string, { isLive: boolean }, string>({
  max: 100,
  ttl: CACHE_TTL_MS,
  fetchMethod: async (channel, _stale, { context: clientId }) => {
    const response = await fetch(TWITCH_GQL_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
      headers: {
        'Client-ID': clientId,
        'Content-Type': 'application/json',
        'User-Agent': TARKOVTRACKER_USER_AGENT,
      },
      body: JSON.stringify({
        query: 'query($login:String!){user(login:$login){stream{id}}}',
        variables: { login: channel },
      }),
    });
    if (!response.ok) throw new Error(`Twitch GQL returned ${response.status}`);
    const data = await response.json();
    return { isLive: !!data?.data?.user?.stream?.id };
  },
});
export default defineEventHandler(async (event) => {
  const { twitchClientId } = useRuntimeConfig(event);
  const query = getQuery(event);
  const channel =
    (typeof query.channel === 'string' ? query.channel.trim().toLowerCase() : '') || '';
  if (!channel || !/^[a-z0-9_]+$/.test(channel)) {
    setResponseHeaders(event, { 'cache-control': 'no-store' });
    return { isLive: false };
  }
  try {
    const result = await liveCache.fetch(channel, { context: twitchClientId as string });
    setResponseHeaders(event, LIVE_HEADERS);
    return result ?? { isLive: false };
  } catch (err) {
    logger.warn(
      'Twitch live check failed:',
      err instanceof Error ? err.message : 'Unknown upstream error'
    );
    setResponseHeaders(event, { 'cache-control': 'no-store' });
    return { isLive: false };
  }
});
