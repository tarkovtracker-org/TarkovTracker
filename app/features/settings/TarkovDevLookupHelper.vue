<template>
  <div class="bg-surface-950/60 space-y-3 rounded-lg border border-white/8 p-3.5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-surface-100 text-xs font-semibold">
        {{ $t('settings.tarkov_dev_import.guided_lookup_title') }}
      </p>
      <UButton
        size="sm"
        color="info"
        variant="subtle"
        icon="i-mdi-open-in-new"
        :href="playersSearchUrl"
        target="_blank"
        rel="noopener noreferrer"
        :disabled="disabled"
        @click="handleOpenLookup"
      >
        {{ $t('settings.tarkov_dev_import.open_players_search') }}
      </UButton>
    </div>
    <ol class="text-surface-300 space-y-1.5 text-xs leading-5">
      <li class="flex items-start gap-2">
        <span
          class="bg-info-500/15 text-info-300 mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold"
        >
          1
        </span>
        <span>{{ $t('settings.tarkov_dev_import.guided_step_1') }}</span>
      </li>
      <li class="flex items-start gap-2">
        <span
          class="bg-info-500/15 text-info-300 mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold"
        >
          2
        </span>
        <span>
          {{ $t('settings.tarkov_dev_import.guided_step_2') }}
          <code class="text-surface-200 bg-surface-900 rounded px-1 py-0.5 font-mono text-xs">
            tarkov.dev/players/regular/8560316
          </code>
        </span>
      </li>
      <li class="flex items-start gap-2">
        <span
          class="bg-info-500/15 text-info-300 mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold"
        >
          3
        </span>
        <span>{{ $t('settings.tarkov_dev_import.guided_step_3') }}</span>
      </li>
    </ol>
    <p v-if="lookupOpened" class="text-info-300 text-xs" role="status">
      {{ $t('settings.tarkov_dev_import.lookup_opened_hint') }}
    </p>
  </div>
</template>
<script setup lang="ts">
  import { buildTarkovDevPlayersUrl } from '@/utils/tarkovDevProfileUrl';
  import type { GameMode } from '@/utils/constants';
  const props = defineProps<{
    initialMode: GameMode;
    disabled?: boolean;
  }>();
  const emit = defineEmits<{ openedLookup: [] }>();
  const lookupOpened = ref(false);
  const playersSearchUrl = computed(() => buildTarkovDevPlayersUrl(props.initialMode));
  function handleOpenLookup() {
    if (props.disabled) return;
    lookupOpened.value = true;
    emit('openedLookup');
  }
</script>
