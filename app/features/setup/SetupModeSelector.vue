<template>
  <section class="space-y-3">
    <div class="space-y-1">
      <h3 class="text-surface-100 text-sm font-semibold">{{ $t('setup.profile.modes_title') }}</h3>
      <p class="text-surface-400 text-xs">{{ $t('setup.profile.modes_hint') }}</p>
    </div>
    <div class="grid gap-2.5 sm:grid-cols-3">
      <button
        v-for="option in modeOptions"
        :key="option.value"
        type="button"
        :data-testid="`setup-mode-${option.value}`"
        class="focus-visible:ring-primary-500/60 flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition focus-visible:ring-2 focus-visible:outline-none"
        :class="option.cardClass"
        :aria-pressed="option.selected"
        @click="emit('toggle', option.value)"
      >
        <GameModeBadge :mode="option.value" class="shrink-0" />
        <span class="min-w-0 flex-1">
          <span class="text-surface-100 block text-sm font-semibold">{{ option.label }}</span>
          <span class="text-surface-400 block text-xs">{{ option.description }}</span>
        </span>
        <UIcon :name="option.icon" class="size-4 shrink-0" :class="option.iconClass" />
      </button>
    </div>
    <div
      v-if="selectedModes.length > 1"
      class="bg-surface-950/60 flex flex-wrap items-center gap-2 rounded-lg border border-white/8 px-3 py-2"
    >
      <span class="text-surface-300 text-xs font-medium">
        {{ $t('setup.profile.primary_mode_label') }}
      </span>
      <div class="flex flex-wrap gap-1.5">
        <UButton
          v-for="mode in selectedModes"
          :key="mode"
          type="button"
          size="xs"
          :color="primaryMode === mode ? 'primary' : 'neutral'"
          :variant="primaryMode === mode ? 'solid' : 'soft'"
          :aria-pressed="primaryMode === mode"
          @click="emit('updatePrimary', mode)"
        >
          {{ $t(getGameModeLabel(mode)) }}
        </UButton>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
  import GameModeBadge from '@/components/GameModeBadge.vue';
  import { GAME_MODE_VALUES, getGameModeLabel, type GameMode } from '@/utils/constants';
  const props = defineProps<{
    selectedModes: readonly GameMode[];
    primaryMode: GameMode;
  }>();
  const emit = defineEmits<{
    toggle: [mode: GameMode];
    updatePrimary: [mode: GameMode];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const modeOptions = computed(() =>
    GAME_MODE_VALUES.map((mode) => {
      const selected = props.selectedModes.includes(mode);
      return {
        value: mode,
        selected,
        label: t(getGameModeLabel(mode)),
        description: t(`setup.profile.mode_descriptions.${mode}`),
        cardClass: selected
          ? 'border-primary-500/45 bg-primary-500/8'
          : 'border-white/10 bg-surface-950/50 hover:border-surface-500',
        icon: selected ? 'i-mdi-check-circle' : 'i-mdi-checkbox-blank-circle-outline',
        iconClass: selected ? 'text-primary-400' : 'text-surface-600',
      };
    })
  );
</script>
