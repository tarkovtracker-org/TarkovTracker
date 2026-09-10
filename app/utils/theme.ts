/**
 * Theme mode primitives for the light/dark appearance toggle.
 *
 * Dark stays the default and is visually unchanged. The selected mode is
 * persisted in its own localStorage key (not the user-scoped preferences
 * store) so the boot script in nuxt.config can apply `data-theme` and
 * `color-scheme` before first paint and avoid a wrong-theme flash.
 */
export const THEME_STORAGE_KEY: string = 'tt_theme';
export const THEME_MODES = ['dark', 'light'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const DEFAULT_THEME_MODE: ThemeMode = 'dark';
/** Normalize any persisted/unknown value to a supported theme mode. */
export const normalizeThemeMode = (value: unknown): ThemeMode => {
  return value === 'light' ? 'light' : DEFAULT_THEME_MODE;
};
/** Read the persisted theme mode. Client-only; falls back to dark on any failure. */
export const readStoredThemeMode = (): ThemeMode => {
  if (!import.meta.client) {
    return DEFAULT_THEME_MODE;
  }
  try {
    return normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_MODE;
  }
};
/** Persist the theme mode for future sessions and the boot script. Client-only. */
export const persistThemeMode = (mode: ThemeMode): void => {
  if (!import.meta.client) {
    return;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Storage may be unavailable (private mode, quota); the session theme still applies.
  }
};
/** Apply the theme mode to the document root. Client-only. */
export const applyThemeMode = (mode: ThemeMode): void => {
  if (!import.meta.client) {
    return;
  }
  document.documentElement.setAttribute('data-theme', mode);
  document.documentElement.style.colorScheme = mode;
};
/**
 * Synchronous boot script inlined into the document head by nuxt.config. Runs
 * before first paint so returning light-theme users never see a dark flash.
 * Keep in sync with readStoredThemeMode/applyThemeMode.
 */
export const THEME_BOOT_SCRIPT: string = [
  '(function(){',
  'try{',
  `var t=window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});`,
  `if(t!=="light"&&t!=="dark"){t=${JSON.stringify(DEFAULT_THEME_MODE)};}`,
  'var e=document.documentElement;',
  'e.setAttribute("data-theme",t);',
  'e.style.colorScheme=t;',
  '}catch(e){}',
  '})();',
].join('');
