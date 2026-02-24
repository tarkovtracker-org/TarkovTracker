import { createLogger } from '@/server/utils/logger';
const logger = createLogger('EdgeCacheKey');
const isLocalhostHost = (hostname: string): boolean => {
  return (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    /^127\./.test(hostname)
  );
};
const resolveCacheOrigin = (appUrl?: string): { host: string; protocol: string } => {
  let host = 'tarkovtracker.org';
  let protocol = 'https:';
  if (!appUrl) {
    return { host, protocol };
  }
  try {
    const parsedAppUrl = new URL(appUrl);
    if (!isLocalhostHost(parsedAppUrl.hostname)) {
      host = parsedAppUrl.host;
      protocol = parsedAppUrl.protocol || 'https:';
    }
  } catch (error) {
    logger.warn('[EdgeCacheKey] Invalid appUrl, falling back to default cache host', error);
  }
  return { host, protocol };
};
export const buildEdgeCacheRequest = (
  cacheKeyPrefix: string,
  key: string,
  appUrl?: string
): Request => {
  const { host, protocol } = resolveCacheOrigin(appUrl);
  const cacheUrl = new URL(`${protocol}//${host}/__edge-cache/${cacheKeyPrefix}/${key}`);
  return new Request(cacheUrl.toString());
};
