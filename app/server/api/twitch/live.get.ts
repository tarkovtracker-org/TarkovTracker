import { defineEventHandler, getQuery, setResponseHeaders } from 'h3';
import { useRuntimeConfig } from '#imports';
import { createLogger } from '@/server/utils/logger';
import { TARKOVTRACKER_USER_AGENT } from '@/server/utils/userAgent';
const logger = createLogger('twitch-live');
const TWITCH_GQL_URL = 'https://gql.twitch.tv/gql';
const CACHE_TTL_MS = 60_000;
const LIVE_HEADERS = { 'cache-control': 'public, max-age=30, s-maxage=60' };
let cachedResult: { channel: string; isLive: boolean; checkedAt: number } | null = null;
export default defineEventHandler(async (event) => {
  const { twitchClientId } = useRuntimeConfig(event);
  const query = getQuery(event);
  const channel =
    (typeof query.channel === 'string' ? query.channel.trim().toLowerCase() : '') || '';
  if (!channel || !/^[a-z0-9_]+$/.test(channel)) {
    setResponseHeaders(event, { 'cache-control': 'no-store' });
    return { isLive: false };
  }
  if (
    cachedResult &&
    cachedResult.channel === channel &&
    Date.now() - cachedResult.checkedAt < CACHE_TTL_MS
  ) {
    setResponseHeaders(event, LIVE_HEADERS);
    return { isLive: cachedResult.isLive };
  }
  try {
    const response = await fetch(TWITCH_GQL_URL, {
      method: 'POST',
      headers: {
        'Client-ID': twitchClientId as string,
        'Content-Type': 'application/json',
        'User-Agent': TARKOVTRACKER_USER_AGENT,
      },
      body: JSON.stringify({
        query: 'query($login:String!){user(login:$login){stream{id}}}',
        variables: { login: channel },
      }),
    });
    if (!response.ok) {
      logger.warn(`Twitch GQL returned ${response.status}`);
      setResponseHeaders(event, { 'cache-control': 'no-store' });
      return { isLive: false };
    }
    const data = await response.json();
    const isLive = !!data?.data?.user?.stream?.id;
    cachedResult = { channel, isLive, checkedAt: Date.now() };
    setResponseHeaders(event, LIVE_HEADERS);
    return { isLive };
  } catch (err) {
    logger.error('Twitch live check failed:', err);
    setResponseHeaders(event, { 'cache-control': 'no-store' });
    return { isLive: false };
  }
});
