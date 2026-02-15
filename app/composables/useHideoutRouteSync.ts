import { storeToRefs } from 'pinia';
import { useRouteFilters } from '@/composables/useRouteFilters';
import { usePreferencesStore } from '@/stores/usePreferences';
import type { HideoutPrimaryView } from '@/composables/useHideoutFiltering';
const HIDEOUT_PRIMARY_VIEWS = ['available', 'maxed', 'locked', 'all'] as const;
const isValidHideoutView = (value: string): value is HideoutPrimaryView =>
  HIDEOUT_PRIMARY_VIEWS.includes(value as HideoutPrimaryView);
type HideoutRouteParams = {
  view: string;
};
export function useHideoutRouteSync() {
  const preferencesStore = usePreferencesStore();
  const { getHideoutPrimaryView } = storeToRefs(preferencesStore);
  return useRouteFilters<HideoutRouteParams>({
    configs: {
      view: {
        key: 'view',
        default: 'available',
        validate: isValidHideoutView,
        serialize: (v) => (v === 'available' ? undefined : v),
        deserialize: (v) => v,
      },
    },
    onRouteToStore: (values) => {
      if (values.view !== preferencesStore.getHideoutPrimaryView) {
        preferencesStore.setHideoutPrimaryView(values.view);
      }
    },
    onStoreToRoute: () => ({
      view: getHideoutPrimaryView.value,
    }),
    watchSources: [getHideoutPrimaryView],
  });
}
