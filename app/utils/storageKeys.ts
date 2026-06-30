export const STORAGE_PREFIX = 'v2_';
export const STORAGE_VERSION = '2';
export const STORAGE_KEYS = {
  storageVersion: `${STORAGE_PREFIX}storage_version`,
  progress: `${STORAGE_PREFIX}progress`,
  preferences: `${STORAGE_PREFIX}preferences`,
  analyticsConsent: `${STORAGE_PREFIX}analytics_consent`,
  dashboardFocusAttribution: `${STORAGE_PREFIX}dashboard_focus_attribution`,
  progressBackupPrefix: `${STORAGE_PREFIX}progress_backup_`,
  adminLastPurge: `${STORAGE_PREFIX}tt:admin:last-purge`,
  cachePurgeAt: `${STORAGE_PREFIX}tt:cache:last-purge`,
  cachePurgeCheckAt: `${STORAGE_PREFIX}tt:cache:last-check`,
  sessionDataMigrated: `${STORAGE_PREFIX}tarkovDataMigrated`,
  activityLogManual: `${STORAGE_PREFIX}activity_log_manual`,
  activityLogLastRead: `${STORAGE_PREFIX}activity_log_last_read`,
  tasksMapPanelExpanded: `${STORAGE_PREFIX}tasks_map_panel_expanded`,
} as const;
export const LEGACY_STORAGE_KEYS = {
  progress: 'progress',
  preferences: 'preferences',
  analyticsConsent: 'analytics_consent',
  user: 'user',
  progressBackupPrefix: 'progress_backup_',
  adminLastPurge: 'tt:admin:last-purge',
  cachePurgeAt: 'tt:cache:last-purge',
  cachePurgeCheckAt: 'tt:cache:last-check',
  sessionDataMigrated: 'tarkovDataMigrated',
  activityLogManual: 'activity_log_manual',
  activityLogLastRead: 'activity_log_last_read',
} as const;
