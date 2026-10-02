import { SUPPORTED_LOCALES, type SupportedLocale } from '@/utils/locales';
type EmptyMessages = Record<string, never>;
type TestLocaleMessages<T> = Record<Exclude<SupportedLocale, 'en'>, EmptyMessages> & { en: T };
export const createTestLocaleMessages = <T extends object = EmptyMessages>(
  en: T = {} as T
): TestLocaleMessages<T> =>
  Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [locale, locale === 'en' ? en : {}])
  ) as TestLocaleMessages<T>;
