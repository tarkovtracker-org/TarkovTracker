<template>
  <!-- Always rendered so the notice is announced when recovery copies appear after load. -->
  <div role="status" aria-live="polite" data-testid="older-tab-recovery-notice-region">
    <div v-if="visible" class="px-3 pt-3 sm:px-6" data-testid="older-tab-recovery-notice">
      <UAlert
        icon="i-mdi-backup-restore"
        color="warning"
        variant="soft"
        :title="t('older_tab_recovery_notice.title')"
        :description="description"
        close
      >
        <template #actions>
          <UButton
            size="xs"
            color="warning"
            variant="solid"
            :to="BACKUP_RESTORE_TARGET"
            trailing-icon="i-mdi-arrow-right"
            data-testid="older-tab-recovery-link"
          >
            {{
              t('older_tab_recovery_notice.review_link', { section: t('common.backup_restore') })
            }}
          </UButton>
        </template>
        <template #close="{ ui }">
          <UButton
            icon="i-mdi-close"
            color="neutral"
            variant="link"
            :aria-label="t('common.close')"
            :class="ui.close()"
            data-testid="older-tab-recovery-dismiss"
            @click="dismiss"
          />
        </template>
      </UAlert>
    </div>
  </div>
</template>
<script setup lang="ts">
  import {
    legacyProgressRecoveryCount,
    legacyProgressRecoveryOverflow,
  } from '@/stores/tarkov/progressAuthority';
  type RecoverySnapshot = { count: number; overflow: boolean };
  const BACKUP_RESTORE_TARGET = '/settings#backup-restore';
  // Hashes that open the Backup & Restore tab, which already lists these copies.
  const BACKUP_RESTORE_HASHES = new Set(['#backup-restore', '#settings-backup-restore']);
  // Route aliases (/progression, /prestige, /preferences) keep the Settings page's route name.
  const SETTINGS_ROUTE_NAME = 'settings';
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  /** Tab-lifetime dismissal (never persisted); new copies or a new overflow show it again. */
  const dismissedAt = useState<RecoverySnapshot | null>('older-tab-recovery-notice', () => null);
  const snapshot = computed<RecoverySnapshot>(() => ({
    count: legacyProgressRecoveryCount.value,
    overflow: legacyProgressRecoveryOverflow.value,
  }));
  const hasRecovery = computed(() => snapshot.value.count > 0 || snapshot.value.overflow);
  const coveredByDismissal = (current: RecoverySnapshot, dismissed: RecoverySnapshot | null) =>
    dismissed !== null &&
    current.count <= dismissed.count &&
    (dismissed.overflow || !current.overflow);
  const onBackupRestoreTab = computed(
    () => route.name === SETTINGS_ROUTE_NAME && BACKUP_RESTORE_HASHES.has(route.hash)
  );
  const visible = computed(
    () =>
      hasRecovery.value &&
      !coveredByDismissal(snapshot.value, dismissedAt.value) &&
      !onBackupRestoreTab.value
  );
  const description = computed(() =>
    t(
      snapshot.value.overflow
        ? 'older_tab_recovery_notice.overflow_description'
        : 'older_tab_recovery_notice.description'
    )
  );
  /** Clearing copies or resolving overflow lowers the baseline, so later ones are announced. */
  const lowerDismissal = (current: RecoverySnapshot, dismissed: RecoverySnapshot) => ({
    count: Math.min(current.count, dismissed.count),
    overflow: dismissed.overflow && current.overflow,
  });
  watch(snapshot, (current) => {
    if (!hasRecovery.value) dismissedAt.value = null;
    else if (dismissedAt.value) dismissedAt.value = lowerDismissal(current, dismissedAt.value);
  });
  const dismiss = () => {
    dismissedAt.value = { ...snapshot.value };
    // The dismiss button unmounts with the notice; keep keyboard focus in the page.
    document.getElementById('main-content')?.focus();
  };
</script>
