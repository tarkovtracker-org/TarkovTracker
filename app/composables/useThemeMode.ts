import { usePreferencesStore } from '@/stores/usePreferences';
/**
 * Keeps the root document theme in sync with the persisted preferences store.
 * Applies both the `data-theme` attribute used by Tailwind tokens and the
 * native `color-scheme` hint used by browser UI.
 */
export function useThemeMode(): void {
  const preferencesStore = usePreferencesStore();
  /**
   * Applies the active theme mode to the root document element.
   */
  const applyThemeMode = (themeMode: 'dark' | 'light') => {
    if (!import.meta.client) return;
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
  };
  watch(
    () => preferencesStore.themeMode,
    (themeMode) => {
      applyThemeMode(themeMode ?? 'dark');
    },
    { immediate: true }
  );
}
