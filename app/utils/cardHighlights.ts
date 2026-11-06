import type { SemanticColor } from '@/types/theme';
/** Shared literal gradient classes for card headers and hideout avatar panels. */
export const CARD_HIGHLIGHT_GRADIENTS = {
  accent: 'bg-gradient-to-br from-accent-800 via-accent-700 to-accent-600',
  error: 'bg-gradient-to-br from-error-800 via-error-700 to-error-600',
  info: 'bg-gradient-to-br from-info-800 via-info-700 to-info-600',
  kappa: 'bg-gradient-to-br from-kappa-800 via-kappa-700 to-kappa-600',
  lightkeeper: 'bg-gradient-to-br from-lightkeeper-800 via-lightkeeper-700 to-lightkeeper-600',
  locked: 'bg-gradient-to-br from-locked-800 via-locked-700 to-locked-600',
  primary: 'bg-gradient-to-br from-primary-800 via-primary-700 to-primary-600',
  pve: 'bg-gradient-to-br from-pve-800 via-pve-700 to-pve-600',
  pvp: 'bg-gradient-to-br from-pvp-800 via-pvp-700 to-pvp-600',
  secondary: 'bg-gradient-to-br from-secondary-800 via-secondary-700 to-secondary-600',
  success: 'bg-gradient-to-br from-success-800 via-success-700 to-success-600',
  surface: 'bg-gradient-to-br from-surface-800 via-surface-700 to-surface-600',
  warning: 'bg-gradient-to-br from-warning-800 via-warning-700 to-warning-600',
} as const satisfies Record<SemanticColor, string>;
