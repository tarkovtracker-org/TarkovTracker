import { markI18nReady } from '@/composables/i18nHelpers';
import { hasSupabaseAuthSessionHint } from '@/utils/clientStorage';
import { resolveAppLocale } from '@/utils/locales';
import { logger } from '@/utils/logger';
import { parseBootstrapPreferencesState } from '@/utils/preferencesStorage';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import type { SupportedLocale } from '@/utils/locales';
import type { Composer, I18n } from 'vue-i18n';
type BootstrapSupabaseContext = {
  user?: {
    id: string | null;
  };
};
function getInitialLocale(supabase?: BootstrapSupabaseContext): SupportedLocale {
  let localeOverride: string | null = null;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const savedPrefs = window.localStorage.getItem(STORAGE_KEYS.preferences);
      if (savedPrefs) {
        const expectedUserId = supabase?.user?.id ?? null;
        const prefs = parseBootstrapPreferencesState(savedPrefs, {
          allowScopedStateDuringSessionHydration:
            expectedUserId === null && hasSupabaseAuthSessionHint(),
          expectedUserId,
        });
        localeOverride = typeof prefs?.localeOverride === 'string' ? prefs.localeOverride : null;
      }
    } catch (error) {
      logger.warn('[i18n] Failed to read locale from localStorage:', error);
    }
  }
  const navLang = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return resolveAppLocale(localeOverride, navLang);
}
type ComposerWithSetLocale = Composer & {
  setLocale?: (locale: SupportedLocale) => Promise<void> | void;
};
async function setI18nLocale(i18n: I18n | Composer, locale: SupportedLocale): Promise<boolean> {
  const target = ('global' in i18n ? i18n.global : i18n) as ComposerWithSetLocale;
  if (typeof target.setLocale === 'function') {
    await target.setLocale(locale);
    return true;
  }
  if (!('locale' in target)) return false;
  const localeValue = target.locale as unknown;
  if (typeof localeValue === 'string') {
    (target as unknown as { locale: string }).locale = locale;
    return true;
  }
  if (localeValue && typeof localeValue === 'object' && 'value' in localeValue) {
    (localeValue as { value: string }).value = locale;
    return true;
  }
  return false;
}
export default defineNuxtPlugin({
  name: 'i18n-ready',
  dependsOn: ['supabase'],
  enforce: 'post',
  parallel: true,
  async setup(nuxtApp) {
    const i18n = (nuxtApp as { $i18n?: I18n | Composer }).$i18n;
    const supabase = (nuxtApp as { $supabase?: BootstrapSupabaseContext }).$supabase;
    if (!i18n) {
      logger.warn('[i18n] Missing i18n instance on nuxtApp; skipping locale init.');
      markI18nReady();
      return;
    }
    const initialLocale = getInitialLocale(supabase);
    try {
      if (!(await setI18nLocale(i18n, initialLocale))) {
        logger.warn('[i18n] Failed to set locale on i18n instance; skipping locale init.');
      }
    } catch (error) {
      logger.warn('[i18n] Failed to initialize locale on i18n instance:', error);
    }
    markI18nReady();
  },
});
