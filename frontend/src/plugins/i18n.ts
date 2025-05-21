// i18n translations
import { createI18n, type I18n, type LocaleMessages } from 'vue-i18n';
import {
  en as vuetifyEn,
  de as vuetifyDe,
  fr as vuetifyFr,
  es as vuetifyEs,
  ru as vuetifyRu,
  uk as vuetifyUk,
} from 'vuetify/locale';
// Assume messages are structured appropriately,
// potentially needing manual type def if library doesn't provide
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Assuming messages are untyped or need specific setup
import messages from '@intlify/unplugin-vue-i18n/messages';
// Define a type for the Vuetify locale messages structure within our messages
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VuetifyLocaleMessages = { $vuetify: any };
// Explicitly type the combined messages structure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppMessages = LocaleMessages<any> & {
  [key: string]: VuetifyLocaleMessages;
};
// Extract just the language code from navigator.language (e.g., 'en' from 'en-US')
const languageCode = navigator.language.split(/[-_]/)[0];
// Define type for the map of Vuetify locales
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vuetifyLocales: Record<string, any> = {
  en: vuetifyEn,
  de: vuetifyDe,
  fr: vuetifyFr,
  es: vuetifyEs,
  ru: vuetifyRu,
  uk: vuetifyUk,
};
const typedMessages = messages as AppMessages;
// Merge Vuetify's locale messages into all supported locales
for (const [locale, vuetifyLocale] of Object.entries(vuetifyLocales)) {
  if (typedMessages[locale]) {
    typedMessages[locale].$vuetify = vuetifyLocale;
  } else {
    // Initialize locale object if it doesn't exist before adding $vuetify
    typedMessages[locale] = { $vuetify: vuetifyLocale };
  }
}
// Explicitly type the i18n instance
const i18n: I18n<
  AppMessages,
  Record<string, never>,
  Record<string, never>,
  string,
  false
> = createI18n({
  legacy: false,
  globalInjection: true, // Enable global injection for $t
  locale: languageCode, // Use detected language code
  fallbackLocale: 'en', // Fallback locale
  messages: typedMessages, // Use the typed and merged messages
});
export default i18n;
