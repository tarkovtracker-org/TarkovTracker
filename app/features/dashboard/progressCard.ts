export type ProgressCardColor =
  'primary' | 'neutral' | 'info' | 'success' | 'kappa' | 'lightkeeper';
export type ProgressBarColor = ProgressCardColor | 'locked' | 'gradient';
type ProgressCardColorClasses = {
  hover: string;
  icon: string;
  iconBg: string;
  percentage: string;
};
export const PROGRESS_CARD_COLOR_CLASSES: Record<ProgressCardColor, ProgressCardColorClasses> = {
  primary: {
    hover: 'hover:border-surface-600',
    iconBg: 'bg-primary-600/15',
    icon: 'text-primary-400',
    percentage: 'text-primary-400',
  },
  neutral: {
    hover: 'hover:border-surface-600',
    iconBg: 'bg-surface-700',
    icon: 'text-surface-300',
    percentage: 'text-surface-50',
  },
  info: {
    hover: 'hover:border-surface-600',
    iconBg: 'bg-info-600/15',
    icon: 'text-info-400',
    percentage: 'text-info-400',
  },
  success: {
    hover: 'hover:border-surface-600',
    iconBg: 'bg-success-600/15',
    icon: 'text-success-400',
    percentage: 'text-success-400',
  },
  kappa: {
    hover: 'hover:border-surface-600',
    iconBg: 'bg-kappa-600/15',
    icon: 'text-kappa-400',
    percentage: 'text-kappa-400',
  },
  lightkeeper: {
    hover: 'hover:border-surface-600',
    iconBg: 'bg-lightkeeper-600/15',
    icon: 'text-lightkeeper-400',
    percentage: 'text-lightkeeper-400',
  },
};
