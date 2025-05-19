import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';
import colors from 'vuetify/lib/util/colors';
import { useI18n } from 'vue-i18n';
import { createVueI18nAdapter } from 'vuetify/locale/adapters/vue-i18n';
import { mdi } from 'vuetify/iconsets/mdi';
import i18n from './i18n';
import { createVuetify, type VuetifyOptions } from 'vuetify';
import type { ThemeDefinition } from 'vuetify';
type ColorThemeKeys =
  | 'primary'
  | 'secondary'
  | 'secondary_dark'
  | 'accent'
  | 'tertiary'
  | 'info'
  | 'success'
  | 'warning'
  | 'complete'
  | 'failed'
  | 'error'
  | 'failure'
  | 'tasklink';
// Type the colorTheme object
const colorTheme: Record<ColorThemeKeys, string> = {
  primary: '#0A0A09',
  secondary: '#9A8866',
  secondary_dark: '#2c261c',
  accent: '#242F35',
  tertiary: '#39230a',
  info: '#181817',
  success: '#242F35', // Note: Same as accent
  warning: '#391111',
  complete: '#114200',
  failed: '#ffcccc',
  error: '#FF0000',
  failure: '#391111', // Note: Same as warning
  tasklink: '#00acc1',
};
const trackerTheme: ThemeDefinition = {
  dark: true,
  colors: {
    ...colorTheme,
    link: '#118cf7',
    bgdarken: colors.grey.darken4,
    enough: '#001638',
    questlink: colors.grey.lighten4,
    objectiveahead: '#193011',
    objectivecomplete: '#114200',
    objectiveuncomplete: '#391111',
    objectiveenough: '#2e455a',
    chartbase: '#ffffff',
    sitebackground: '#121212',
    contentbackground: '#1E1E1E',
  },
};
// Explicitly type the options passed to createVuetify
const vuetifyOptions: VuetifyOptions = {
  locale: {
    // The adapter type should be inferred correctly here
    adapter: createVueI18nAdapter({ i18n, useI18n }),
  },
  defaults: {
    global: {
      ripple: false,
    },
  },
  icons: {
    defaultSet: 'mdi',
    sets: {
      mdi,
    },
  },
  theme: {
    defaultTheme: 'trackerTheme',
    themes: {
      trackerTheme,
    },
  },
};
export default createVuetify(vuetifyOptions);
