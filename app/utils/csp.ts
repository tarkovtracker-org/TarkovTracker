export type ContentSecurityPolicyOptions = {
  allowUnsafeInlineScripts?: boolean;
  clientLogSinkUrl?: string;
  clarityInstrumentationKey?: string;
  gaMeasurementId?: string;
  supabaseUrl?: string;
};
const GITHUB_IMAGE_ORIGINS = ['https://avatars.githubusercontent.com', 'https://github.com'];
const hasConfiguredValue = (value: string | undefined): boolean => Boolean(value?.trim());
const isLocalHttpHost = (hostname: string): boolean => {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
};
const getCspOrigin = (value: string | undefined): string | null => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }
  try {
    const parsedUrl = new URL(trimmedValue);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsedUrl.protocol)) {
      return null;
    }
    return parsedUrl.origin;
  } catch {
    return null;
  }
};
const getWebSocketCspOrigin = (value: string | undefined): string | null => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }
  try {
    const parsedUrl = new URL(trimmedValue);
    if (parsedUrl.protocol === 'https:') {
      return `wss://${parsedUrl.host}`;
    }
    if (parsedUrl.protocol === 'http:' && isLocalHttpHost(parsedUrl.hostname)) {
      return `ws://${parsedUrl.host}`;
    }
    if (parsedUrl.protocol === 'ws:' || parsedUrl.protocol === 'wss:') {
      return parsedUrl.origin;
    }
    return null;
  } catch {
    return null;
  }
};
const getUniqueSources = (sources: Array<string | null | undefined>): string[] => {
  return Array.from(new Set(sources.filter((source): source is string => Boolean(source))));
};
const getDefaultSrcSources = (): string[] => {
  return getUniqueSources(["'self'"]);
};
const getFontSrcSources = (): string[] => {
  return getUniqueSources(["'self'", 'data:', 'https://fonts.gstatic.com']);
};
const getOverlayScriptSrcSources = (options: ContentSecurityPolicyOptions = {}): string[] => {
  return getUniqueSources([options.allowUnsafeInlineScripts ? "'unsafe-inline'" : "'none'"]);
};
export const getScriptSrcSources = (options: ContentSecurityPolicyOptions = {}): string[] => {
  const hasGoogleAnalytics = hasConfiguredValue(options.gaMeasurementId);
  const hasMicrosoftClarity = hasConfiguredValue(options.clarityInstrumentationKey);
  return getUniqueSources([
    "'self'",
    options.allowUnsafeInlineScripts ? "'unsafe-inline'" : null,
    'https://static.cloudflareinsights.com',
    'https://player.twitch.tv',
    hasGoogleAnalytics ? 'https://*.googletagmanager.com' : null,
    hasMicrosoftClarity ? 'https://*.clarity.ms' : null,
    hasMicrosoftClarity ? 'https://c.bing.com' : null,
  ]);
};
export const getConnectSrcSources = (options: ContentSecurityPolicyOptions = {}): string[] => {
  const hasGoogleAnalytics = hasConfiguredValue(options.gaMeasurementId);
  const hasMicrosoftClarity = hasConfiguredValue(options.clarityInstrumentationKey);
  return getUniqueSources([
    "'self'",
    'https://cloudflareinsights.com',
    hasGoogleAnalytics ? 'https://*.googletagmanager.com' : null,
    hasGoogleAnalytics ? 'https://*.google-analytics.com' : null,
    hasGoogleAnalytics ? 'https://*.analytics.google.com' : null,
    hasMicrosoftClarity ? 'https://*.clarity.ms' : null,
    hasMicrosoftClarity ? 'https://c.bing.com' : null,
    'https://api.iconify.design',
    'https://raw.githubusercontent.com',
    'https://assets.tarkov.dev',
    'https://tarkovtracker.github.io',
    'https://*.supabase.co',
    'wss://*.supabase.co',
    getCspOrigin(options.clientLogSinkUrl),
    getCspOrigin(options.supabaseUrl),
    getWebSocketCspOrigin(options.supabaseUrl),
  ]);
};
export const getImgSrcSources = (options: ContentSecurityPolicyOptions = {}): string[] => {
  const hasGoogleAnalytics = hasConfiguredValue(options.gaMeasurementId);
  const hasMicrosoftClarity = hasConfiguredValue(options.clarityInstrumentationKey);
  return getUniqueSources([
    "'self'",
    'data:',
    'https:',
    hasGoogleAnalytics ? 'https://*.googletagmanager.com' : null,
    hasGoogleAnalytics ? 'https://*.google-analytics.com' : null,
    hasMicrosoftClarity ? 'https://*.clarity.ms' : null,
    hasMicrosoftClarity ? 'https://c.bing.com' : null,
    'https://cdn.discordapp.com',
    ...GITHUB_IMAGE_ORIGINS,
    'https://assets.tarkov.dev',
  ]);
};
export const getFrameSrcSources = (): string[] => {
  return getUniqueSources(["'self'", 'https://player.twitch.tv']);
};
const getStyleSrcSources = (): string[] => {
  return getUniqueSources(["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']);
};
export const buildContentSecurityPolicy = (options: ContentSecurityPolicyOptions = {}): string => {
  return [
    `default-src ${getDefaultSrcSources().join(' ')}`,
    `script-src ${getScriptSrcSources(options).join(' ')}`,
    `worker-src blob: 'self'`,
    `connect-src ${getConnectSrcSources(options).join(' ')}`,
    `img-src ${getImgSrcSources(options).join(' ')}`,
    `frame-src ${getFrameSrcSources().join(' ')}`,
    `style-src ${getStyleSrcSources().join(' ')}`,
    `font-src ${getFontSrcSources().join(' ')}`,
  ].join('; ');
};
// buildAppContentSecurityPolicy keeps allowUnsafeInlineScripts enabled to preserve Nuxt/SPA
// bootstrap and hydration scripts, matching the "preserves Nuxt bootstrap scripts" test note.
// This weakens the CSP; if the app moves to nonce/hash-based CSPs, change this function to stop
// setting allowUnsafeInlineScripts and update callers to provide the stricter script policy.
export const buildAppContentSecurityPolicy = (
  options: Omit<ContentSecurityPolicyOptions, 'allowUnsafeInlineScripts'> = {}
): string => {
  return buildContentSecurityPolicy({
    ...options,
    allowUnsafeInlineScripts: true,
  });
};
export const buildOverlayContentSecurityPolicy = (
  options: ContentSecurityPolicyOptions = {}
): string => {
  return [
    "default-src 'none'",
    `script-src ${getOverlayScriptSrcSources(options).join(' ')}`,
    "connect-src 'self'",
    "img-src 'self' data:",
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "base-uri 'none'",
    "frame-ancestors 'self'",
    "form-action 'none'",
  ].join('; ');
};
