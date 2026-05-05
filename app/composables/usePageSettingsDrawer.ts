const PAGE_SETTINGS_DRAWER_STATE_KEYS = {
  hideout: 'hideoutSettingsDrawer:isOpen',
  needed_items: 'neededItemsSettingsDrawer:isOpen',
  tasks: 'taskSettingsDrawer:isOpen',
} as const;
type PageSettingsDrawerKey = keyof typeof PAGE_SETTINGS_DRAWER_STATE_KEYS;
type UsePageSettingsDrawerResult = {
  isOpen: globalThis.Ref<boolean>;
  open: () => void;
  close: () => void;
  toggle: () => void;
};
export function usePageSettingsDrawer(pageKey: PageSettingsDrawerKey): UsePageSettingsDrawerResult {
  const stateKey = PAGE_SETTINGS_DRAWER_STATE_KEYS[pageKey];
  const isOpen = useState<boolean>(stateKey, () => false);
  const route = useRoute();
  const initialPath = route.path;
  watch(
    () => route.path,
    (newPath: string) => {
      if (newPath !== initialPath) {
        isOpen.value = false;
      }
    }
  );
  const open = () => {
    isOpen.value = true;
  };
  const close = () => {
    isOpen.value = false;
  };
  const toggle = () => {
    isOpen.value = !isOpen.value;
  };
  return {
    isOpen,
    open,
    close,
    toggle,
  };
}
