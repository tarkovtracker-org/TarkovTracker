<template>
  <div class="space-y-4">
    <button
      type="button"
      data-testid="setup-start-import"
      class="bg-surface-900/90 hover:border-primary-400/55 hover:bg-surface-850 focus-visible:ring-primary-500/60 group border-primary-500/35 flex w-full cursor-pointer items-start gap-4 rounded-xl border p-5 text-left shadow-sm transition focus-visible:ring-2 focus-visible:outline-none"
      @click="emit('select', 'import')"
    >
      <span
        class="bg-info-500/15 border-info-500/30 flex size-11 shrink-0 items-center justify-center rounded-xl border"
      >
        <UIcon name="i-mdi-account-arrow-up-outline" class="text-info-300 size-6" />
      </span>
      <span class="min-w-0 flex-1 space-y-2">
        <span class="flex flex-wrap items-center gap-2">
          <span class="text-surface-50 text-base font-semibold">
            {{ $t('setup.start.import.label') }}
          </span>
          <UBadge color="info" variant="subtle" size="sm">
            {{ $t('settings.data_management.recommended_badge') }}
          </UBadge>
        </span>
        <span class="text-surface-300 block text-sm leading-relaxed">
          {{ $t('setup.start.import.description') }}
        </span>
        <span class="flex flex-wrap gap-1.5 pt-0.5">
          <UBadge
            v-for="pill in importHighlights"
            :key="pill"
            color="neutral"
            variant="soft"
            size="xs"
          >
            {{ $t(pill) }}
          </UBadge>
        </span>
      </span>
      <UIcon
        name="i-mdi-chevron-right"
        class="text-surface-400 group-hover:text-primary-300 mt-1 size-5 shrink-0 transition-transform group-hover:translate-x-0.5"
      />
    </button>
    <div class="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        data-testid="setup-start-manual"
        class="bg-surface-900/90 hover:border-surface-500 hover:bg-surface-850 focus-visible:ring-primary-500/60 group flex cursor-pointer items-start gap-3.5 rounded-xl border border-white/10 p-4 text-left shadow-sm transition focus-visible:ring-2 focus-visible:outline-none"
        @click="emit('select', 'manual')"
      >
        <span
          class="bg-primary-500/12 border-primary-500/25 flex size-10 shrink-0 items-center justify-center rounded-xl border"
        >
          <UIcon name="i-mdi-compass-outline" class="text-primary-300 size-5" />
        </span>
        <span class="min-w-0 flex-1 space-y-1">
          <span class="text-surface-50 block text-sm font-semibold">
            {{ $t('setup.start.manual.label') }}
          </span>
          <span class="text-surface-400 block text-xs leading-5">
            {{ $t('setup.start.manual.description') }}
          </span>
        </span>
        <UIcon
          name="i-mdi-chevron-right"
          class="text-surface-500 group-hover:text-surface-200 mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
        />
      </button>
      <button
        type="button"
        data-testid="setup-start-backup"
        class="bg-surface-900/90 hover:border-surface-500 hover:bg-surface-850 focus-visible:ring-primary-500/60 group flex cursor-pointer items-start gap-3.5 rounded-xl border border-white/10 p-4 text-left shadow-sm transition focus-visible:ring-2 focus-visible:outline-none"
        @click="emit('select', 'backup')"
      >
        <span
          class="bg-surface-700/50 border-surface-600/70 flex size-10 shrink-0 items-center justify-center rounded-xl border"
        >
          <UIcon name="i-mdi-backup-restore" class="text-surface-200 size-5" />
        </span>
        <span class="min-w-0 flex-1 space-y-1">
          <span class="text-surface-50 block text-sm font-semibold">
            {{ $t('setup.start.backup.label') }}
          </span>
          <span class="text-surface-400 block text-xs leading-5">
            {{ $t('setup.start.backup.description') }}
          </span>
        </span>
        <UIcon
          name="i-mdi-chevron-right"
          class="text-surface-500 group-hover:text-surface-200 mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
        />
      </button>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
      <p class="text-surface-400 text-xs">{{ $t('setup.start.reassurance') }}</p>
      <UButton to="/" color="neutral" variant="ghost" size="sm">
        {{ $t('setup.skip_to_dashboard') }}
      </UButton>
    </div>
  </div>
</template>
<script setup lang="ts">
  import type { SetupPath } from '@/features/setup/useSetupCheckpoint';
  const emit = defineEmits<{ select: [path: SetupPath] }>();
  const importHighlights = [
    'setup.start.highlights.auto_mode',
    'setup.start.highlights.profile_skills',
    'setup.start.highlights.quest_logs',
  ] as const;
</script>
