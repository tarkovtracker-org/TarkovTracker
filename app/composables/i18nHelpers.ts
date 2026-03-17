import { resolveAppLocale } from '@/utils/locales';
import { logger } from '@/utils/logger';
import { parseBootstrapPreferencesState } from '@/utils/preferencesStorage';
import { STORAGE_KEYS } from '@/utils/storageKeys';
// Global flag to track i18n readiness
let i18nReady = false;
// Module-scoped writable ref for fallback locale (internal, shared across all callers)
// Caching semantics: This ref is initialized once when first accessed and can be updated
// by storage events. External callers receive a readonly view to prevent mutations.
let cachedFallbackLocale: Ref<string> | null = null;
// Storage event listener to update cached locale when localStorage changes
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEYS.preferences && cachedFallbackLocale) {
      const savedLocale = getSavedLocale();
      const newValue = resolveAppLocale(savedLocale, getBrowserLanguage());
      logger.debug('[i18nHelpers] Storage event detected, updating cached locale:', newValue);
      cachedFallbackLocale.value = newValue;
    }
  });
}
/**
 * Mark i18n as ready (called from main.ts after setup)
 */
export function markI18nReady() {
  i18nReady = true;
}
/**
 * Reset i18n ready state (test-only utility)
 * @internal Used for resetting module state between test runs
 */
export function resetI18nReady() {
  i18nReady = false;
  cachedFallbackLocale = null;
}
/**
 * Get saved locale from localStorage (SSR-safe)
 */
function getSavedLocale(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    // All localStorage access is inside try-catch to handle SecurityError
    // that can occur in some browsers (e.g., Safari private browsing)
    const savedPrefs = window.localStorage?.getItem(STORAGE_KEYS.preferences);
    if (savedPrefs) {
      const prefs = parseBootstrapPreferencesState(savedPrefs);
      return typeof prefs?.localeOverride === 'string' ? prefs.localeOverride : null;
    }
  } catch (error) {
    logger.warn('[i18nHelpers] Failed to read locale from localStorage:', error);
  }
  return null;
}
/**
 * Safely gets the current locale from i18n, falling back to saved preference or browser language.
 *
 * Returns either a writable Ref<string> or a Readonly<Ref<string>>:
 * - When i18n is available: returns the live i18n locale ref (fully reactive, writable)
 * - When falling back: returns a readonly ref to prevent mutations to shared cache
 */
export function useSafeLocale(): Ref<string> | Readonly<Ref<string>> {
  const instance = getCurrentInstance();
  logger.debug('[useSafeLocale] instance:', !!instance, 'i18nReady:', i18nReady);
  if (instance && i18nReady) {
    try {
      // Use useI18n with explicit global scope to avoid parent scope warnings
      const { locale } = useI18n({
        useScope: 'global',
        inheritLocale: true,
      });
      // Return the locale ref directly - it's already a writable Ref<string>
      return locale;
    } catch (error) {
      logger.warn('[useSafeLocale] Could not access i18n context:', error);
    }
  }
  // When i18n is ready but no component context (e.g., plugin initialization),
  // read from localStorage preference first, then fallback to browser language
  // Use cached ref to ensure all callers share the same reactive state
  if (!cachedFallbackLocale) {
    const savedLocale = getSavedLocale();
    const fallbackValue = resolveAppLocale(savedLocale, getBrowserLanguage());
    logger.debug('[useSafeLocale] Initializing cached fallback locale:', fallbackValue);
    cachedFallbackLocale = ref(fallbackValue);
  }
  // Return readonly view to prevent external mutations of shared cache
  return readonly(cachedFallbackLocale);
}
/**
 * Extracts language code from locale, falling back to 'en'
 */
export function extractLanguageCode(
  locale: string | null | undefined,
  availableLanguages?: string[]
): string {
  // Guard against null/undefined/non-string values
  if (locale == null || typeof locale !== 'string' || locale.length === 0) {
    return 'en';
  }
  const browserLocale = locale.split(/[-_]/)[0];
  // Only perform whitelist validation when availableLanguages is provided
  if (availableLanguages) {
    // Fix: Ensure browserLocale is defined before using it in includes()
    if (browserLocale) {
      return availableLanguages.includes(browserLocale) ? browserLocale : 'en';
    }
    return 'en';
  }
  // If no whitelist provided, return browser locale (or 'en' if extraction failed)
  return browserLocale || 'en';
}
/**
 * Gets the browser's language preference as a fallback (SSR-safe)
 */
export function getBrowserLanguage(): string {
  // SSR-safe check: ensure we're in a browser environment with navigator available
  if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') {
    return navigator.language.split(/[-_]/)[0] || 'en';
  }
  return 'en';
}
