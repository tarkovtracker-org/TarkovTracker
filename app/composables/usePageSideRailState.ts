import type { ComputedRef } from '#imports';
interface PageSideRailStateOptions {
  helpOpen: globalThis.Ref<boolean>;
  settingsOpen?: globalThis.Ref<boolean>;
}
interface PageSideRailState {
  isDesktopHelpPanelOpen: ComputedRef<boolean>;
  isMobileHelpPanelOpen: ComputedRef<boolean>;
  isDesktopSettingsDrawerOpen: ComputedRef<boolean>;
  isMobileSettingsDrawerOpen: ComputedRef<boolean>;
  isDesktopSideRailOpen: ComputedRef<boolean>;
}
export function usePageSideRailState({
  helpOpen,
  settingsOpen,
}: PageSideRailStateOptions): PageSideRailState {
  const { lgAndUp } = useSharedBreakpoints();
  const isSettingsOpen = computed(() => settingsOpen?.value === true);
  const isDesktopSettingsDrawerOpen = computed(() => isSettingsOpen.value && lgAndUp.value);
  const isMobileSettingsDrawerOpen = computed(() => isSettingsOpen.value && !lgAndUp.value);
  const isDesktopHelpPanelOpen = computed(() => helpOpen.value && lgAndUp.value);
  const isMobileHelpPanelOpen = computed(() => helpOpen.value && !lgAndUp.value);
  const isDesktopSideRailOpen = computed(
    () => lgAndUp.value && (helpOpen.value || isSettingsOpen.value)
  );
  return {
    isDesktopHelpPanelOpen,
    isMobileHelpPanelOpen,
    isDesktopSettingsDrawerOpen,
    isMobileSettingsDrawerOpen,
    isDesktopSideRailOpen,
  };
}
