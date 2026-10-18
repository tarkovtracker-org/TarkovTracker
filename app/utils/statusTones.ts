/**
 * One color per progress status, shared by the status tab bars, the task graph,
 * and the station cards so the same status never reads as two different colors.
 * Class strings stay literal so Tailwind can find them at build time.
 */
export type StatusTone = 'neutral' | 'info' | 'locked' | 'success' | 'error';
export interface StatusTabItem<V extends string = string> {
  value: V;
  label: string;
  icon: string;
  count: number;
  tone: StatusTone;
  /** Help tour anchor for this tab. */
  helpTarget?: string;
}
/** "All" is the same on every status bar: neutral, first, and set apart by a divider. */
export const ALL_TAB_ICON = 'i-mdi-format-list-bulleted';
interface StatusToneClasses {
  /** Count badge background; the numerals stay white unless the light theme needs ink. */
  badge: string;
  /** Outline, fill, and text of the selected tab. */
  selected: string;
}
const STATUS_TONE_CLASSES: Record<StatusTone, StatusToneClasses> = {
  neutral: {
    badge: 'bg-surface-500',
    selected:
      'border-white/15 bg-white/10 text-white ring-1 ring-white/10 light:border-surface-600 light:bg-surface-700/60 light:text-surface-50 light:ring-surface-600/40',
  },
  info: {
    badge: 'bg-info-600',
    selected:
      'border-info-500/45 bg-info-500/12 text-white ring-1 ring-info-500/25 light:text-info-700',
  },
  locked: {
    // locked-600 keeps white numerals at AA, where locked-500 would not.
    badge: 'bg-locked-600',
    selected:
      'border-locked-500/45 bg-locked-500/12 text-white ring-1 ring-locked-500/25 light:text-locked-700',
  },
  success: {
    // Dark badges need success-700 for AA; light badges keep their pale fill and ink.
    badge: 'bg-success-700 light:bg-success-100 light:text-surface-50',
    selected:
      'border-success-500/45 bg-success-500/12 text-white ring-1 ring-success-500/25 light:text-success-700',
  },
  error: {
    badge: 'bg-error-500',
    selected:
      'border-error-500/45 bg-error-500/12 text-white ring-1 ring-error-500/25 light:text-error-700',
  },
};
/** Badge for a status with nothing in it, dimmed so it reads as empty in any tone. */
const EMPTY_STATUS_BADGE_CLASS = 'bg-surface-600 light:text-surface-50';
/** Unselected tab: an outlined button that matches the Filters and Settings buttons beside it. */
const IDLE_TAB_CLASS =
  'text-surface-200 border-white/10 hover:border-white/20 hover:bg-white/5 hover:text-white light:border-surface-600 light:bg-surface-800/70 light:hover:bg-surface-800 light:hover:text-surface-50';
/** Every status tab and segment button shares this frame so selected and idle line up. */
const TAB_BASE_CLASS =
  'border font-medium leading-none transition-colors duration-150 disabled:cursor-default disabled:opacity-100';
export const getStatusBadgeClass = (tone: StatusTone, count: number): string =>
  count > 0 ? STATUS_TONE_CLASSES[tone].badge : EMPTY_STATUS_BADGE_CLASS;
export const getTabClass = (tone: StatusTone, isSelected: boolean): string[] => [
  TAB_BASE_CLASS,
  isSelected ? STATUS_TONE_CLASSES[tone].selected : IDLE_TAB_CLASS,
];
