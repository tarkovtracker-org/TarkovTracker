/**
 * Mapping of objective types to MDI icon names.
 * Uses const assertion for literal types on keys and values.
 */
export const OBJECTIVE_ICON_MAP = {
  key: 'mdi-key',
  shoot: 'mdi-target-account',
  giveItem: 'mdi-hand-coin',
  findItem: 'mdi-checkbox-marked-circle-outline',
  findQuestItem: 'mdi-alert-circle-outline',
  giveQuestItem: 'mdi-alert-circle-check-outline',
  plantQuestItem: 'mdi-arrow-down-thin-circle-outline',
  plantItem: 'mdi-arrow-down-thin-circle-outline',
  taskStatus: 'mdi-account-child-circle',
  extract: 'mdi-heart-circle-outline',
  mark: 'mdi-remote',
  place: 'mdi-arrow-down-drop-circle-outline',
  traderLevel: 'mdi-thumb-up',
  traderStanding: 'mdi-thumb-up',
  skill: 'mdi-dumbbell',
  visit: 'mdi-crosshairs-gps',
  buildWeapon: 'mdi-progress-wrench',
  playerLevel: 'mdi-crown-circle-outline',
  experience: 'mdi-eye-circle-outline',
  warning: 'mdi-alert-circle',
  useItem: 'mdi-hand-heart',
} as const;
