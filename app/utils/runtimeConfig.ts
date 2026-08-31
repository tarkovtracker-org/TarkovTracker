export const GITHUB_IMAGE_DOMAINS = ['avatars.githubusercontent.com', 'github.com'] as const;
export const TARKOV_IMAGE_DOMAINS = ['assets.tarkov.dev'] as const;
export const YOUTUBE_IMAGE_DOMAINS = ['i.ytimg.com'] as const;
export const PRIMARY_APP_HOSTNAMES = ['tarkovtracker.org', 'www.tarkovtracker.org'] as const;
const PRODUCTION_APP_URL = 'https://tarkovtracker.org';
const LOCAL_APP_HOSTNAMES = new Set(['localhost', '127.0.0.1']);
const resolveEnvValue = (...values: Array<string | undefined>) =>
  values.find((value) => value?.trim())?.trim() || '';
const resolveHostname = (value?: string): string => {
  const trimmed = value?.trim().toLowerCase() || '';
  if (!trimmed) {
    return '';
  }
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
  } catch {
    return '';
  }
};
const normalizePublicAppUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};
export const resolveSupabaseRuntimeConfig = (env: NodeJS.ProcessEnv) => {
  const anonKey = env.SUPABASE_ANON_KEY?.trim() || '';
  const url = env.SUPABASE_URL?.trim() || '';
  if (Boolean(anonKey) !== Boolean(url)) {
    throw new Error('[Config] Incomplete Supabase credentials: SUPABASE_*');
  }
  return {
    privateAnonKey: anonKey,
    privateUrl: url,
    publicAnonKey: anonKey,
    publicUrl: url,
  };
};
export const resolvePublicAppUrl = (env: NodeJS.ProcessEnv): string => {
  const configuredUrl = resolveEnvValue(env.APP_URL, env.CF_PAGES_URL);
  if (!configuredUrl) {
    return 'http://localhost:3000';
  }
  return normalizePublicAppUrl(configuredUrl);
};
export const resolveCanonicalSiteUrl = (appUrl?: string): string => {
  const normalizedUrl = normalizePublicAppUrl(appUrl || '').replace(/\/$/, '');
  if (!normalizedUrl) {
    return PRODUCTION_APP_URL;
  }
  return LOCAL_APP_HOSTNAMES.has(resolveHostname(normalizedUrl))
    ? PRODUCTION_APP_URL
    : normalizedUrl;
};
export const resolveClientLogSinkUrl = (env: NodeJS.ProcessEnv): string => {
  return resolveEnvValue(env.NUXT_PUBLIC_CLIENT_LOG_SINK_URL);
};
export const isPagesPreviewHostname = (hostname?: string): boolean => {
  const normalizedHostname = resolveHostname(hostname);
  return normalizedHostname.endsWith('.pages.dev');
};
export const isPrimaryAppHostname = (hostname?: string): boolean => {
  const normalizedHostname = resolveHostname(hostname);
  return PRIMARY_APP_HOSTNAMES.includes(
    normalizedHostname as (typeof PRIMARY_APP_HOSTNAMES)[number]
  );
};
export const shouldEnableAnalyticsIntegrations = ({
  appUrl,
  hostname,
  isProduction,
}: {
  appUrl?: string;
  hostname?: string;
  isProduction: boolean;
}): boolean => {
  if (!isProduction) {
    return false;
  }
  const normalizedHostname = resolveHostname(hostname) || resolveHostname(appUrl);
  if (!normalizedHostname || normalizedHostname.endsWith('.pages.dev')) {
    return false;
  }
  return PRIMARY_APP_HOSTNAMES.includes(
    normalizedHostname as (typeof PRIMARY_APP_HOSTNAMES)[number]
  );
};
export const shouldUseOfflineSupabaseFallback = ({
  hostname,
  isProduction,
}: {
  hostname?: string;
  isProduction: boolean;
}): boolean => {
  if (!isProduction) {
    return true;
  }
  return isPagesPreviewHostname(hostname);
};
