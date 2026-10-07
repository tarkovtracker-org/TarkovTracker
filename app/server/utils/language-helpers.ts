import { API_SUPPORTED_LANGUAGES } from '~/utils/constants';
function isSupportedLanguage(lang: string): lang is (typeof API_SUPPORTED_LANGUAGES)[number] {
  return (API_SUPPORTED_LANGUAGES as readonly string[]).includes(lang);
}
export function getValidatedLanguage(
  query: Record<string, unknown>
): (typeof API_SUPPORTED_LANGUAGES)[number] {
  const raw = Array.isArray(query.lang) ? query.lang[0] : query.lang;
  const lang = (typeof raw === 'string' ? raw : '').toLowerCase() || 'en';
  return isSupportedLanguage(lang) ? lang : 'en';
}
