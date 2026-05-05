import { STATIC_TIME_MAPS, resolveStaticDisplayTime } from '@/utils/mapTime';
import type { ComputedRef, Ref } from '#imports';
type MapTimePeriod = 'dawn' | 'day' | 'dusk' | 'night' | 'default';
type MapTimeStyle = {
  badgeClass: string;
  iconClass: string;
  labelClass: string;
  valueClass: string;
};
interface MapTimeEntry extends MapTimeStyle {
  icon: string;
  period: MapTimePeriod;
  value: string;
}
const MAP_TIME_ICONS: Record<MapTimePeriod, string> = {
  dawn: 'i-mdi-weather-sunset-up',
  day: 'i-mdi-weather-sunny',
  dusk: 'i-mdi-weather-sunset-down',
  night: 'i-mdi-moon-waxing-crescent',
  default: 'i-mdi-clock-time-four-outline',
};
const MAP_TIME_STYLES: Record<MapTimePeriod, MapTimeStyle> = {
  dawn: {
    badgeClass: 'border-primary-500/35 bg-primary-500/10',
    iconClass: 'text-primary-300',
    labelClass: 'text-primary-200/90',
    valueClass: 'text-primary-100',
  },
  day: {
    badgeClass: 'border-warning-500/35 bg-warning-500/10',
    iconClass: 'text-warning-300',
    labelClass: 'text-warning-200/90',
    valueClass: 'text-warning-100',
  },
  dusk: {
    badgeClass: 'border-error-500/35 bg-error-500/10',
    iconClass: 'text-error-300',
    labelClass: 'text-error-200/90',
    valueClass: 'text-error-100',
  },
  night: {
    badgeClass: 'border-info-500/35 bg-info-500/10',
    iconClass: 'text-info-300',
    labelClass: 'text-info-200/90',
    valueClass: 'text-info-100',
  },
  default: {
    badgeClass: 'bg-surface-900/60 border-surface-700',
    iconClass: 'text-surface-300',
    labelClass: 'text-surface-300',
    valueClass: 'text-surface-100',
  },
};
export const resolveMapTimePeriod = (hour: number): MapTimePeriod => {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 18) return 'day';
  if (hour >= 18 && hour < 20) return 'dusk';
  return 'night';
};
export function useMapTime(
  mapId: ComputedRef<string | null | undefined>,
  tarkovTime: Ref<string>
): {
  displayTime: ComputedRef<string>;
  getMapTimeLabel: (period: MapTimePeriod) => string;
  mapTimeEntries: ComputedRef<MapTimeEntry[]>;
} {
  const { t } = useI18n({ useScope: 'global' });
  const displayTime = computed(() => {
    if (!mapId.value) return tarkovTime.value;
    const staticTime = STATIC_TIME_MAPS[mapId.value];
    if (!staticTime) return tarkovTime.value;
    return resolveStaticDisplayTime(staticTime, tarkovTime.value);
  });
  const getMapTimeLabel = (period: MapTimePeriod): string => {
    return t(`page.tasks.map.time_period.${period}`);
  };
  const mapTimeEntries = computed(() => {
    return displayTime.value
      .split('/')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((value) => {
        const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
        if (!match) {
          return {
            value,
            period: 'default' as MapTimePeriod,
            icon: MAP_TIME_ICONS.default,
            ...MAP_TIME_STYLES.default,
          };
        }
        const hour = Number(match[1]);
        const period =
          Number.isInteger(hour) && hour >= 0 && hour <= 23
            ? resolveMapTimePeriod(hour)
            : 'default';
        return { value, period, icon: MAP_TIME_ICONS[period], ...MAP_TIME_STYLES[period] };
      });
  });
  return {
    displayTime,
    getMapTimeLabel,
    mapTimeEntries,
  };
}
