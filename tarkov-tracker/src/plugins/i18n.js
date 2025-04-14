// i18n translations
import { createI18n } from "vue-i18n";
import messages from "@intlify/unplugin-vue-i18n/messages";

// Extract just the language code from navigator.language (e.g., 'en' from 'en-US')
const languageCode = navigator.language.split(/[-_]/)[0];

const i18n = createI18n({
  legacy: false,
  globalInjection: true, // Enable global injection for $t
  locale: languageCode,
  fallbackLocale: "en",
  messages,
});

export default i18n;
