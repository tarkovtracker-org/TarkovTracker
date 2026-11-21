import { createError, setResponseHeaders, type H3Event } from 'h3';
import { useRuntimeConfig } from '#imports';
import { buildAppContentSecurityPolicy } from '@/utils/csp';
type AssetBinding = { fetch: (request: Request) => Promise<Response> };
const fetchProfileShell = async (assets: AssetBinding | undefined): Promise<string> => {
  if (typeof assets?.fetch !== 'function') {
    throw createError({ statusCode: 503, message: 'Profile shell unavailable' });
  }
  // ASSETS bypasses the Function router. The URL has no user path, query, or headers.
  try {
    const shell = await assets.fetch(new Request('https://assets.local/profile'));
    if (shell.status !== 200 || !shell.headers.get('content-type')?.startsWith('text/html')) {
      throw new Error('Invalid profile shell response');
    }
    return await shell.text();
  } catch {
    throw createError({ statusCode: 503, message: 'Profile shell unavailable' });
  }
};
export const serveProfileShell = async (event: H3Event, accepts: (pathname: string) => boolean) => {
  const config = useRuntimeConfig(event).public;
  setResponseHeaders(event, {
    'X-Robots-Tag': 'noindex, nofollow',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': buildAppContentSecurityPolicy({
      supabaseUrl: config.supabaseUrl,
      clientLogSinkUrl: config.clientLogSinkUrl,
      gaMeasurementId: config.googleAnalyticsMeasurementId,
      clarityInstrumentationKey: config.microsoftClarityProjectId,
      turnstileSiteKey: config.turnstileSiteKey || config.tarkovAccessSiteKey,
    }),
  });
  const pathname = event.path.split('?')[0] ?? '';
  if (!accepts(pathname)) {
    throw createError({ statusCode: 404, message: 'Not Found' });
  }
  const assets = event.context.cloudflare?.env?.ASSETS as AssetBinding | undefined;
  const shell = import.meta.dev
    ? await (await useNitroApp().localFetch('/profile')).text()
    : await fetchProfileShell(assets);
  setResponseHeaders(event, { 'Content-Type': 'text/html; charset=utf-8' });
  return shell;
};
