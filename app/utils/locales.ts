export const SUPPORTED_LOCALES = ['en', 'de', 'es', 'fr', 'ru', 'uk', 'zh', 'ko'] as const;
export const DEFAULT_LOCALE = 'en' as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const isSupportedLocale = (value: string): value is SupportedLocale =>
  SUPPORTED_LOCALES.includes(value as SupportedLocale);
const getLocaleBase = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) return null;
  return trimmedValue.split(/[-_]/)[0] || null;
};
export const resolveSupportedLocale = (
  value: string | null | undefined
): SupportedLocale | null => {
  const localeBase = getLocaleBase(value);
  if (!localeBase || !isSupportedLocale(localeBase)) {
    return null;
  }
  return localeBase;
};
export const resolveAppLocale = (
  preferredLocale: string | null | undefined,
  fallbackLocale?: string | null | undefined
): SupportedLocale => {
  return (
    resolveSupportedLocale(preferredLocale) ??
    resolveSupportedLocale(fallbackLocale) ??
    DEFAULT_LOCALE
  );
};
