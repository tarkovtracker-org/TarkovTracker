import { useHideoutStationStatus } from '@/composables/useHideoutStationStatus';
import { formatHideoutTraderRequirement } from '@/features/hideout/formatHideoutTraderRequirement';
import { HIDEOUT_PINS, type HideoutPin } from '@/features/hideout/hideoutMapLayout';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import type { HideoutLevel, HideoutStation, ItemRequirement } from '@/types/tarkov';
export const UPGRADE_STATES = ['ready', 'items', 'locked', 'maxed'] as const;
export type UpgradeState = (typeof UPGRADE_STATES)[number];
export const STATE_LABELS: Record<UpgradeState, string> = {
  ready: 'page.hideout.map.states.ready',
  items: 'page.hideout.map.states.items',
  locked: 'page.hideout.map.states.locked',
  maxed: 'page.hideout.map.states.maxed',
};
export const STATE_ICONS: Record<UpgradeState, string> = {
  ready: 'i-mdi-check-circle-outline',
  items: 'i-mdi-package-variant',
  locked: 'i-mdi-lock-outline',
  maxed: 'i-mdi-flag-checkered',
};
export interface HideoutMapStation {
  station: HideoutStation;
  pin?: HideoutPin;
  level: number;
  state: UpgradeState;
  reason: string;
}
export function useHideoutMapStations(stations: () => HideoutStation[]) {
  const { t } = useI18n({ useScope: 'global' });
  const progress = useProgressStore();
  const tarkov = useTarkovStore();
  const { isStationReqMet, isSkillReqMet, isTraderReqMet } = useHideoutStationStatus();
  function blocker(level: HideoutLevel) {
    const station = level.stationLevelRequirements.find((req) => !isStationReqMet(req));
    if (station)
      return t('page.hideout.stationcard.requirements.station', {
        stationname: station.station.name,
        level: station.level,
      });
    const skill = level.skillRequirements.find((req) => !isSkillReqMet(req));
    if (skill)
      return t('page.hideout.stationcard.requirements.skill', {
        skillname: skill.name,
        level: skill.level,
      });
    const trader = level.traderRequirements.find((req) => !isTraderReqMet(req));
    if (trader) return formatHideoutTraderRequirement(t, trader);
    return '';
  }
  function needsItem(requirement: ItemRequirement) {
    const count = tarkov.getHideoutPartCount(requirement.id);
    if (count === 0 && tarkov.isHideoutPartComplete(requirement.id)) return false;
    return count < requirement.count;
  }
  function status(next?: HideoutLevel): Pick<HideoutMapStation, 'state' | 'reason'> {
    if (!next) return { state: 'maxed', reason: '' };
    const reason = blocker(next);
    if (reason) return { state: 'locked', reason };
    const missing = next.itemRequirements.filter(needsItem).length;
    if (missing) return { state: 'items', reason: t('page.hideout.map.missing', missing) };
    return { state: 'ready', reason: '' };
  }
  return computed(() =>
    stations().map((station) => {
      const level = progress.hideoutLevels?.[station.id]?.self ?? 0;
      const next = station.levels.find((tier) => tier.level === level + 1);
      return { station, level, pin: HIDEOUT_PINS[station.normalizedName ?? ''], ...status(next) };
    })
  );
}
