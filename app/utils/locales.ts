export const SUPPORTED_LOCALES = [
  'cs',
  'de',
  'en',
  'es',
  'fr',
  'it',
  'ja',
  'ko',
  'pl',
  'pt',
  'ru',
  'uk',
  'zh',
] as const;
const DEFAULT_LOCALE = 'en' as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
const isSupportedLocale = (value: string): value is SupportedLocale =>
  SUPPORTED_LOCALES.includes(value as SupportedLocale);
const getLocaleBase = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) return null;
  return trimmedValue.split(/[-_]/)[0] || null;
};
const resolveSupportedLocale = (value: string | null | undefined): SupportedLocale | null => {
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
/**
 * A locale's name in its own language ("Deutsch", "日本語"), so people can find their language
 * whatever the current UI language is. Falls back to the upper-case code if `Intl` lacks data.
 */
export const getLocaleNativeName = (code: string): string => {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    if (name && name !== code) return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    // Unknown or malformed tag: fall through to the code.
  }
  return code.toUpperCase();
};
