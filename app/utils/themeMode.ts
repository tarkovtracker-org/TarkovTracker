export const THEME_MODES = ['dark', 'light'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const isThemeMode = (value: unknown): value is ThemeMode => {
  return typeof value === 'string' && THEME_MODES.includes(value as ThemeMode);
};
export const normalizeThemeMode = (value: unknown): ThemeMode | null => {
  return isThemeMode(value) ? value : null;
};
export const getThemeModeFromBootstrapState = (
  state: Record<string, unknown> | null | undefined
): ThemeMode | null => {
  return state ? normalizeThemeMode(state.themeMode) : null;
};
export const buildThemeBootstrapScript = (storageKeys: readonly string[]): string => {
  return `
(() => {
  const storageKeys = ${JSON.stringify(storageKeys)};
  const themeModes = ${JSON.stringify(THEME_MODES)};
  const isThemeMode = (value) => typeof value === 'string' && themeModes.includes(value);
  const parseJson = (value) => {
    if (typeof value !== 'string' || value.length === 0) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };
  const getAuthUserId = (storage) => {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !key.endsWith('-auth-token')) continue;
      const parsed = parseJson(storage.getItem(key));
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        const session =
          entry && typeof entry === 'object' && 'currentSession' in entry
            ? entry.currentSession
            : entry && typeof entry === 'object' && 'session' in entry
              ? entry.session
              : entry;
        if (!session || typeof session !== 'object' || !('user' in session)) continue;
        const user = session.user;
        if (user && typeof user === 'object' && typeof user.id === 'string' && user.id.length > 0) {
          return user.id;
        }
      }
    }
    return null;
  };
  const getThemeModeFromState = (state) => {
    if (!state || typeof state !== 'object') return null;
    return isThemeMode(state.themeMode) ? state.themeMode : null;
  };
  const getThemeModeFromStorage = (storage, authUserId) => {
    for (const storageKey of storageKeys) {
      const parsed = parseJson(storage.getItem(storageKey));
      if (!parsed || typeof parsed !== 'object') continue;
      if ('data' in parsed) {
        const scopedUserId = typeof parsed._userId === 'string' ? parsed._userId : null;
        if (scopedUserId !== authUserId) continue;
        const themeMode = getThemeModeFromState(parsed.data);
        if (themeMode) return themeMode;
        continue;
      }
      const themeMode = getThemeModeFromState(parsed);
      if (themeMode) return themeMode;
    }
    return null;
  };
  try {
    const authUserId = getAuthUserId(window.localStorage);
    const themeMode = getThemeModeFromStorage(window.localStorage, authUserId);
    if (!themeMode) return;
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
  } catch {
    return;
  }
})();
  `.trim();
};
