import { useMetadataStore, type CraftSource } from '@/stores/useMetadata';
import { useProgressStore } from '@/stores/useProgress';
import { logger } from '@/utils/logger';
export interface CraftSourceStatus extends CraftSource {
  currentLevel: number;
  isAvailable: boolean;
  missingLevels: number;
}
export interface UseCraftableItemReturn {
  craftSources: ComputedRef<CraftSource[]>;
  isCraftable: ComputedRef<boolean>;
  craftSourceStatuses: ComputedRef<CraftSourceStatus[]>;
  isCraftableAvailable: ComputedRef<boolean>;
  craftStationTargetId: ComputedRef<string>;
  craftableIconClass: ComputedRef<string>;
  craftableTitle: ComputedRef<string>;
  goToCraftStation: () => Promise<void>;
}
/**
 * Composable for craftable item logic.
 * Provides craft source information, availability status, and navigation.
 *
 * @param itemId - Reactive or raw item ID to check craftability
 * @returns Craftable item state and actions
 */
export function useCraftableItem(
  itemId: MaybeRefOrGetter<string | undefined>
): UseCraftableItemReturn {
  const metadataStore = useMetadataStore();
  const progressStore = useProgressStore();
  const craftSources = computed(() => {
    const currentItemId = toValue(itemId);
    if (!currentItemId) {
      return [];
    }
    return metadataStore.craftSourcesByItemId.get(currentItemId) ?? [];
  });
  const isCraftable = computed(() => craftSources.value.length > 0);
  const craftSourceStatuses = computed((): CraftSourceStatus[] => {
    return craftSources.value.map((source) => {
      const currentLevel = progressStore.hideoutLevels?.[source.stationId]?.self ?? 0;
      return {
        ...source,
        currentLevel,
        isAvailable: currentLevel >= source.stationLevel,
        missingLevels: Math.max(0, source.stationLevel - currentLevel),
      };
    });
  });
  const isCraftableAvailable = computed(() => {
    return craftSourceStatuses.value.some((source) => source.isAvailable);
  });
  const craftStationTargetId = computed(() => {
    if (!isCraftable.value) {
      return '';
    }
    // Prefer available stations, sorted by level (lowest first)
    const available = craftSourceStatuses.value
      .filter((source) => source.isAvailable)
      .sort((a, b) => a.stationLevel - b.stationLevel);
    if (available.length > 0) {
      return available[0]?.stationId ?? '';
    }
    // Otherwise, find the closest to being available
    // Sort a spread copy to avoid mutation: fewest missingLevels first, then lowest stationLevel.
    const closest = [...craftSourceStatuses.value].sort((a, b) => {
      if (a.missingLevels !== b.missingLevels) {
        return a.missingLevels - b.missingLevels;
      }
      return a.stationLevel - b.stationLevel;
    });
    return closest[0]?.stationId ?? craftSources.value[0]?.stationId ?? '';
  });
  const craftableIconClass = computed(() => {
    if (!isCraftable.value) {
      return '';
    }
    return isCraftableAvailable.value ? 'text-success-400' : 'text-error-500 light:text-error-800';
  });
  const craftableTitle = computed(() => {
    if (!isCraftable.value) {
      return '';
    }
    const prefix = isCraftableAvailable.value
      ? 'Craftable now'
      : 'Craftable (station level too low)';
    const preview = craftSourceStatuses.value
      .slice(0, 3)
      .map(
        (source) => `${source.stationName} ${source.stationLevel} (you: ${source.currentLevel})`
      );
    const remainingCount = craftSourceStatuses.value.length - preview.length;
    const remainingText = remainingCount > 0 ? ` +${remainingCount} more` : '';
    return `${prefix}: ${preview.join(', ')}${remainingText}`;
  });
  const goToCraftStation = async () => {
    if (!craftStationTargetId.value) {
      return;
    }
    try {
      await navigateTo({
        path: '/hideout',
        query: { station: craftStationTargetId.value },
      });
    } catch (error) {
      const stationId = craftStationTargetId.value;
      const message = `[useCraftableItem] Failed to navigate to craft station (stationId: ${stationId}).`;
      logger.error(message, { stationId, error });
      throw new Error(message, { cause: error });
    }
  };
  return {
    craftSources,
    isCraftable,
    craftSourceStatuses,
    isCraftableAvailable,
    craftStationTargetId,
    craftableIconClass,
    craftableTitle,
    goToCraftStation,
  };
}
