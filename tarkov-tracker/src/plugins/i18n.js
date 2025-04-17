// i18n translations
import { createI18n } from "vue-i18n";
import {
  en as vuetifyEn,
  de as vuetifyDe,
  fr as vuetifyFr,
  es as vuetifyEs,
  ru as vuetifyRu,
  uk as vuetifyUk,
} from "vuetify/locale";
import messages from "@intlify/unplugin-vue-i18n/messages";

// Extract just the language code from navigator.language (e.g., 'en' from 'en-US')
const languageCode = navigator.language.split(/[-_]/)[0];

// Merge Vuetify's locale messages into all supported locales
const vuetifyLocales = {
  en: vuetifyEn,
  de: vuetifyDe,
  fr: vuetifyFr,
  es: vuetifyEs,
  ru: vuetifyRu,
  uk: vuetifyUk,
};
for (const [locale, vuetifyLocale] of Object.entries(vuetifyLocales)) {
  if (messages[locale]) {
    messages[locale].$vuetify = vuetifyLocale;
  } else {
    messages[locale] = { $vuetify: vuetifyLocale };
  }
}

const i18n = createI18n({
  legacy: false,
  globalInjection: true, // Enable global injection for $t
  locale: languageCode,
  fallbackLocale: "en",
  messages,
});

export default i18n;
