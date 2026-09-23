import { resolvePublicAppUrl } from '@/utils/runtimeConfig';
/**
 * Upstream's identity string. Used verbatim when this deployment has no app URL configured
 * (or it fails to resolve to a usable http(s) origin), so outbound requests never claim to be
 * an instance they are not.
 */
const UPSTREAM_TARKOVTRACKER_USER_AGENT = 'TarkovTracker/1.0 (+https://tarkovtracker.org)';
const LOCAL_APP_URL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);
/**
 * Derive this deployment's outbound User-Agent from its configured public app URL
 * (`resolvePublicAppUrl`, the same APP_URL/CF_PAGES_URL resolution used for the site's own
 * canonical URL) so requests to tarkov.dev, GitHub, and Twitch identify this instance instead
 * of being misattributed to the upstream tarkovtracker.org project. Every installation names
 * itself automatically; an unconfigured or unparsable app URL falls back to the exact upstream
 * value, so upstream itself sees no behavior change.
 */
export const resolveTarkovTrackerUserAgent = (env: NodeJS.ProcessEnv): string => {
  const appUrl = resolvePublicAppUrl(env);
  try {
    const { hostname, origin, protocol } = new URL(appUrl);
    // resolvePublicAppUrl always normalizes into an http(s) URL today, so this branch is
    // defense-in-depth against a future change to that normalization rather than a reachable
    // path with the current implementation.
    if (!/^https?:$/.test(protocol) || LOCAL_APP_URL_HOSTNAMES.has(hostname.toLowerCase())) {
      return UPSTREAM_TARKOVTRACKER_USER_AGENT;
    }
    return `TarkovTracker/1.0 (+${origin})`;
  } catch {
    return UPSTREAM_TARKOVTRACKER_USER_AGENT;
  }
};
export const TARKOVTRACKER_USER_AGENT = resolveTarkovTrackerUserAgent(process.env);
