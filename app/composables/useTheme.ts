import {
  applyThemeMode,
  normalizeThemeMode,
  persistThemeMode,
  readStoredThemeMode,
  type ThemeMode,
} from '@/utils/theme';
/**
 * Shared light/dark theme state (issue #102).
 *
 * The initial value comes from the same localStorage key the head boot script
 * applies before first paint, so toggling never causes a mismatch or flash.
 * The preference is device-local; account-level sync is a separate follow-up.
 */
export const useTheme = () => {
  const themeMode = useState<ThemeMode>('theme-mode', () => readStoredThemeMode());
  themeMode.value = readStoredThemeMode();
  // Idempotent sync with the boot script (also covers tests/CSP-blocked boots).
  applyThemeMode(themeMode.value);
  const setThemeMode = (mode: ThemeMode) => {
    const normalized = normalizeThemeMode(mode);
    themeMode.value = normalized;
    persistThemeMode(normalized);
    applyThemeMode(normalized);
  };
  const toggleThemeMode = () => {
    setThemeMode(themeMode.value === 'light' ? 'dark' : 'light');
  };
  return {
    themeMode: readonly(themeMode),
    isLightTheme: computed(() => themeMode.value === 'light'),
    setThemeMode,
    toggleThemeMode,
  };
};
