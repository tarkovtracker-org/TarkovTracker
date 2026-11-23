import { useMetadataStore } from '@/stores/useMetadata';
/** Level badge artwork for a player level, plus whether level metadata has finished loading. */
export function useDrawerLevelBadge(level: MaybeRefOrGetter<number>) {
  const metadataStore = useMetadataStore();
  const isReady = computed<boolean>(
    () => !metadataStore.loading && metadataStore.playerLevels.length > 0
  );
  const badgeSrc = computed<string>(() => {
    const current = toValue(level);
    const entry = metadataStore.playerLevels.find((playerLevel) => playerLevel.level === current);
    return entry?.levelBadgeImageLink ?? '';
  });
  return { badgeSrc, isReady };
}
