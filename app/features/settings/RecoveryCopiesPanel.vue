<template>
  <section
    v-if="hasOlderTabCopies || copies.length"
    class="bg-surface-900/80 space-y-3 rounded-md border border-white/10 p-3"
    data-testid="recovery-copies"
    aria-labelledby="recovery-copies-title"
  >
    <div class="space-y-1">
      <p id="recovery-copies-title" class="text-surface-100 text-sm font-semibold">
        {{ $t('settings.data_management.recovery_copies_title') }}
      </p>
      <p class="text-surface-400 text-sm">
        {{ $t('settings.data_management.recovery_copies_description') }}
      </p>
    </div>
    <OlderTabRecoveryCopies v-if="hasOlderTabCopies" :backup="backup" :parsing="parsing" />
    <ul v-if="copies.length" class="space-y-2">
      <SupersededCopyItem v-for="copy in copies" :key="copy.id" :copy="copy" :backup="backup" />
    </ul>
  </section>
  <div v-if="!hasOlderTabCopies">
    <UButton
      variant="link"
      color="neutral"
      size="xs"
      icon="i-mdi-download"
      class="px-0"
      data-testid="device-recovery-archive-download"
      @click="exportRecoveryArchive"
    >
      {{ $t('settings.data_management.device_recovery_archive_link') }}
    </UButton>
  </div>
</template>
<script setup lang="ts">
  import OlderTabRecoveryCopies from '@/features/settings/OlderTabRecoveryCopies.vue';
  import SupersededCopyItem from '@/features/settings/SupersededCopyItem.vue';
  import {
    useRecoveryArchiveExport,
    useSupersededCopies,
  } from '@/features/settings/useRecoveryCopies';
  import type { UseDataBackupReturn } from '@/composables/useDataBackup';
  const props = defineProps<{ backup: UseDataBackupReturn; parsing: boolean }>();
  const { copies } = useSupersededCopies();
  const exportRecoveryArchive = useRecoveryArchiveExport(props.backup);
  const hasOlderTabCopies = computed(
    () =>
      props.backup.legacyProgressRecoveryCount.value > 0 ||
      props.backup.legacyProgressRecoveryOverflow.value
  );
</script>
