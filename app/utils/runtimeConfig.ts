export const GITHUB_IMAGE_DOMAINS = ['avatars.githubusercontent.com', 'github.com'] as const;
export const TARKOV_IMAGE_DOMAINS = ['assets.tarkov.dev'] as const;
export const PRIMARY_APP_HOSTNAMES = ['tarkovtracker.org', 'www.tarkovtracker.org'] as const;
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
type SupabaseCredentialCandidate = { anonKey: string; source: string; url: string };
const buildSupabaseCredentialCandidate = (
  anonKey: string | undefined,
  source: string,
  url: string | undefined
): SupabaseCredentialCandidate => ({
  anonKey: anonKey?.trim() || '',
  source,
  url: url?.trim() || '',
});
const buildSupabaseCredentialCandidates = (
  env: NodeJS.ProcessEnv
): SupabaseCredentialCandidate[] => [
  buildSupabaseCredentialCandidate(env.SUPABASE_ANON_KEY, 'SUPABASE_*', env.SUPABASE_URL),
  buildSupabaseCredentialCandidate(
    env.NUXT_PUBLIC_SUPABASE_ANON_KEY,
    'NUXT_PUBLIC_SUPABASE_*',
    env.NUXT_PUBLIC_SUPABASE_URL
  ),
  buildSupabaseCredentialCandidate(
    env.VITE_SUPABASE_ANON_KEY,
    'VITE_SUPABASE_*',
    env.VITE_SUPABASE_URL
  ),
];
const resolveSupabaseCredentialPair = (
  candidates: SupabaseCredentialCandidate[]
): SupabaseCredentialCandidate => {
  const selectedIndex = candidates.findIndex(({ anonKey, url }) => anonKey && url);
  const selected = candidates[selectedIndex];
  const partial = candidates
    .slice(0, selectedIndex === -1 ? candidates.length : selectedIndex)
    .find(({ anonKey, url }) => Boolean(anonKey) !== Boolean(url));
  if (partial) throw new Error(`[Config] Incomplete Supabase credentials: ${partial.source}`);
  return selected ?? { anonKey: '', source: '', url: '' };
};
export const resolveSupabaseRuntimeConfig = (env: NodeJS.ProcessEnv) => {
  const selected = resolveSupabaseCredentialPair(buildSupabaseCredentialCandidates(env));
  return {
    privateAnonKey: selected.anonKey,
    privateUrl: selected.url,
    publicAnonKey: selected.anonKey,
    publicUrl: selected.url,
  };
};
export const resolvePublicAppUrl = (env: NodeJS.ProcessEnv): string => {
  const configuredUrl = resolveEnvValue(env.NUXT_PUBLIC_APP_URL, env.APP_URL, env.CF_PAGES_URL);
  if (!configuredUrl) {
    return 'http://localhost:3000';
  }
  return normalizePublicAppUrl(configuredUrl);
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
