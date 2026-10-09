const STORAGE_PREFIX = 'v2_';
export const STORAGE_VERSION = '2';
export const STORAGE_KEYS = {
  storageVersion: `${STORAGE_PREFIX}storage_version`,
  progress: `${STORAGE_PREFIX}progress`,
  preferences: `${STORAGE_PREFIX}preferences`,
  analyticsConsent: `${STORAGE_PREFIX}analytics_consent`,
  dashboardFocusAttribution: `${STORAGE_PREFIX}dashboard_focus_attribution`,
  progressBackupPrefix: `${STORAGE_PREFIX}progress_backup_`,
  /** One account recovery copy per owner: `${prefix}${userId}` (see `CONTEXT.md`). */
  progressRecoveryPrefix: `${STORAGE_PREFIX}progress_recovery_`,
  /** Export-only progress displaced by a reset or Seasonal rollover. */
  progressSupersededPrefix: `${STORAGE_PREFIX}progress_superseded_`,
  /** Opaque, ownerless preservation for active progress that cannot be parsed. */
  progressQuarantinePrefix: `${STORAGE_PREFIX}progress_quarantine_`,
  /**
   * `${prefix}${userId}` names the quarantine created while removing that owner's device data,
   * so later removals stay incomplete while it exists. Shares the quarantine prefix so
   * diagnostics exclude it with the quarantined bytes.
   */
  progressQuarantineRemovalMarkerPrefix: `${STORAGE_PREFIX}progress_quarantine_removal_`,
  /**
   * `${prefix}${userId}` marks an explicit device-data removal that left that owner's data
   * behind, so a reload can still retry it. One key per owner keeps tabs from overwriting others.
   */
  deviceDataRemovalIncompletePrefix: `${STORAGE_PREFIX}device_data_removal_incomplete_`,
  adminLastPurge: `${STORAGE_PREFIX}tt:admin:last-purge`,
  cachePurgeAt: `${STORAGE_PREFIX}tt:cache:last-purge`,
  cachePurgeCheckAt: `${STORAGE_PREFIX}tt:cache:last-check`,
  sessionDataMigrated: `${STORAGE_PREFIX}tarkovDataMigrated`,
  activityLogManual: `${STORAGE_PREFIX}activity_log_manual`,
  activityLogLastRead: `${STORAGE_PREFIX}activity_log_last_read`,
  tasksMapPanelExpanded: `${STORAGE_PREFIX}tasks_map_panel_expanded`,
  supportBannerDismissedAt: `${STORAGE_PREFIX}support_banner_dismissed_at`,
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
