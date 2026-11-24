<template>
  <div class="max-w-sm space-y-2">
    <p class="text-surface-400 text-sm">{{ $t('setup.choose_mode') }}</p>
    <GameModeToggle
      :model-value="mode"
      :disabled-modes="dataLoading ? allModes : []"
      @update:model-value="switchMode"
    />
    <p v-if="switchModeError" class="text-error-400 text-sm" role="alert">
      {{ $t(switchModeError) }}
    </p>
  </div>
  <div class="grid gap-3 sm:grid-cols-3">
    <UButton
      v-for="item in startOptions"
      :key="item.step"
      class="border-surface-700 h-full items-start gap-3 border p-3 text-start whitespace-normal sm:flex-col sm:p-4"
      color="neutral"
      variant="outline"
      :disabled="dataLoading"
      @click="emit('select', item.step)"
    >
      <UIcon :name="item.icon" class="text-primary-400 mt-0.5 size-5 shrink-0" />
      <span class="grid min-w-0 gap-1">
        <span class="font-semibold">
          {{ $t(`setup.start.${item.step.replaceAll('-', '_')}.label`) }}
        </span>
        <span class="text-surface-400 text-sm font-normal">
          {{ $t(`setup.start.${item.step.replaceAll('-', '_')}.description`) }}
        </span>
      </span>
    </UButton>
  </div>
  <UButton to="/" color="neutral" variant="ghost">{{ $t('setup.open_dashboard') }}</UButton>
</template>
<script setup lang="ts">
  import GameModeToggle from '@/features/settings/GameModeToggle.vue';
  import { GAME_MODES, type GameMode } from '@/utils/constants';
  defineProps<{ mode: GameMode }>();
  const emit = defineEmits<{ select: [step: 'backup' | 'eft-logs' | 'tarkov-dev'] }>();
  const { dataLoading, switchMode, switchModeError } = useGameModeSwitch();
  const startOptions = [
    { step: 'eft-logs', icon: 'i-mdi-folder-upload-outline' },
    { step: 'tarkov-dev', icon: 'i-mdi-account-arrow-up-outline' },
    { step: 'backup', icon: 'i-mdi-backup-restore' },
  ] as const;
  const allModes = Object.values(GAME_MODES);
</script>
