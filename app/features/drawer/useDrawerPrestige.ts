import { clampPrestigeLevel } from '@/stores/tarkov/prestige';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { GAME_MODES } from '@/utils/constants';
import type { PrestigeLevel } from '@/types/tarkov';
const levelOf = (prestige: PrestigeLevel): number | undefined =>
  prestige.prestigeLevel ?? prestige.level;
/**
 * The active mode's prestige for the sidebar. Seasonal has no prestige, so `isAvailable` is false
 * there; prestige 0 has no in-game emblem, so `iconLink` stays empty until the first prestige.
 */
export function useDrawerPrestige() {
  const { t } = useI18n({ useScope: 'global' });
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const isAvailable = computed<boolean>(
    () => tarkovStore.getCurrentGameMode() !== GAME_MODES.SEASONAL
  );
  const level = computed<number>(() =>
    clampPrestigeLevel(tarkovStore.getCurrentProgressData().prestigeLevel ?? 0)
  );
  const iconLink = computed<string>(() => {
    if (level.value === 0) return '';
    const entry = metadataStore.prestigeLevels.find(
      (prestige) => levelOf(prestige) === level.value
    );
    return entry?.iconLink ?? '';
  });
  const label = computed<string>(() =>
    level.value === 0 ? t('prestige.no_prestige') : t('prestige.prestige_n', { n: level.value })
  );
  return { iconLink, isAvailable, label, level };
}
