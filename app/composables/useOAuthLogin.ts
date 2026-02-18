import { logger } from '@/utils/logger';
import type { Ref } from '#imports';
export type OAuthProvider = 'twitch' | 'discord' | 'google' | 'github';
interface UseOAuthLoginOptions {
  buildCallbackUrl: () => string;
  loading: Ref<Record<OAuthProvider, boolean>>;
  openPopupOrRedirect: (url: string, provider: OAuthProvider) => void;
}
const toProviderLabel = (provider: OAuthProvider): string => {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
};
export function useOAuthLogin({
  buildCallbackUrl,
  loading,
  openPopupOrRedirect,
}: UseOAuthLoginOptions): {
  signInWithProvider: (provider: OAuthProvider) => Promise<void>;
} {
  const { $supabase } = useNuxtApp();
  const signInWithProvider = async (provider: OAuthProvider): Promise<void> => {
    try {
      loading.value[provider] = true;
      const callbackUrl = buildCallbackUrl();
      const data = await $supabase.signInWithOAuth(provider, {
        skipBrowserRedirect: true,
        redirectTo: callbackUrl,
      });
      if (data?.url) {
        openPopupOrRedirect(data.url, provider);
      }
    } catch (error) {
      logger.error(`[Login] ${toProviderLabel(provider)} sign in error:`, error);
      loading.value[provider] = false;
    }
  };
  return { signInWithProvider };
}
