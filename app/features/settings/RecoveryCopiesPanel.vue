<template>
  <section
    v-if="hasOlderTabCopies || copies.length"
    ref="section"
    tabindex="-1"
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
      <SupersededCopyItem
        v-for="copy in copies"
        :key="`${copy.ownerId}:${copy.id}`"
        :copy="copy"
        :backup="backup"
        :locked="locked"
        @discarded="focusAfterDiscard"
      />
    </ul>
  </section>
  <div v-if="!hasOlderTabCopies">
    <UButton
      ref="archiveLink"
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
  const props = defineProps<{
    backup: UseDataBackupReturn;
    /** Older-tab review stays usable during a preview, so it only waits for parsing. */
    parsing: boolean;
    /** Restore and discard wait for every import, which could overwrite their result. */
    locked: boolean;
  }>();
  const { copies } = useSupersededCopies();
  const exportRecoveryArchive = useRecoveryArchiveExport(props.backup);
  const section = ref<HTMLElement | null>(null);
  const archiveLink = ref<{ $el?: HTMLElement } | null>(null);
  /** A discarded copy's buttons are gone; keep focus in the section, or on the link once it closes. */
  function focusAfterDiscard() {
    void nextTick(() => (section.value ?? archiveLink.value?.$el)?.focus());
  }
  const hasOlderTabCopies = computed(
    () =>
      props.backup.legacyProgressRecoveryCount.value > 0 ||
      props.backup.legacyProgressRecoveryOverflow.value
  );
</script>
