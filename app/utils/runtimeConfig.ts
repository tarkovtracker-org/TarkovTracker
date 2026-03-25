export const GITHUB_IMAGE_DOMAINS = ['avatars.githubusercontent.com', 'github.com'] as const;
export const TARKOV_IMAGE_DOMAINS = ['assets.tarkov.dev'] as const;
const resolveEnvValue = (...values: Array<string | undefined>) =>
  values.find((value) => value?.trim())?.trim() || '';
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
  return {
    privateAnonKey: resolveEnvValue(
      env.NUXT_SUPABASE_ANON_KEY,
      env.NUXT_PUBLIC_SUPABASE_ANON_KEY,
      env.SUPABASE_ANON_KEY,
      env.VITE_SUPABASE_ANON_KEY
    ),
    privateUrl: resolveEnvValue(
      env.NUXT_SUPABASE_URL,
      env.NUXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_URL,
      env.VITE_SUPABASE_URL
    ),
    publicAnonKey: resolveEnvValue(
      env.NUXT_PUBLIC_SUPABASE_ANON_KEY,
      env.NUXT_SUPABASE_ANON_KEY,
      env.SUPABASE_ANON_KEY,
      env.VITE_SUPABASE_ANON_KEY
    ),
    publicUrl: resolveEnvValue(
      env.NUXT_PUBLIC_SUPABASE_URL,
      env.NUXT_SUPABASE_URL,
      env.SUPABASE_URL,
      env.VITE_SUPABASE_URL
    ),
  };
};
export const resolvePublicAppUrl = (env: NodeJS.ProcessEnv): string => {
  const configuredUrl = resolveEnvValue(env.NUXT_PUBLIC_APP_URL, env.CF_PAGES_URL);
  if (!configuredUrl) {
    return 'http://localhost:3000';
  }
  return normalizePublicAppUrl(configuredUrl);
};
export const isPagesPreviewHostname = (hostname?: string): boolean => {
  const normalizedHostname = hostname?.trim().toLowerCase() || '';
  return normalizedHostname.endsWith('.pages.dev');
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
