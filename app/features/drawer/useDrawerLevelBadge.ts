import { useMetadataStore } from '@/stores/useMetadata';
/**
 * Level badge artwork for a player level. `isLoading` stays true until level metadata arrives,
 * but ends on a metadata error so the badge falls back to an icon instead of spinning forever.
 */
export function useDrawerLevelBadge(level: MaybeRefOrGetter<number>) {
  const metadataStore = useMetadataStore();
  const isLoading = computed<boolean>(
    () => metadataStore.loading || (!metadataStore.error && metadataStore.playerLevels.length === 0)
  );
  const badgeSrc = computed<string>(() => {
    const current = toValue(level);
    const entry = metadataStore.playerLevels.find((playerLevel) => playerLevel.level === current);
    return entry?.levelBadgeImageLink ?? '';
  });
  return { badgeSrc, isLoading };
}
