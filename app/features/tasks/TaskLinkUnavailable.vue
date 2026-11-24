<template>
  <UAlert
    v-if="taskId && mode"
    data-testid="task-link-unavailable"
    class="mb-4"
    role="status"
    color="warning"
    variant="soft"
    icon="i-mdi-information-outline"
    :title="t('page.tasks.shared_link.unavailable', { mode: t(getGameModeLabel(mode)) })"
    :description="description"
    :ui="{ actions: 'flex-wrap' }"
    close
    @update:open="emit('dismiss', taskId)"
  >
    <template v-if="availableModes.length" #actions>
      <UButton
        v-for="availableMode in availableModes"
        :key="availableMode"
        :data-testid="`task-link-switch-${availableMode}`"
        color="warning"
        variant="outline"
        size="sm"
        @click="emit('switch-mode', availableMode)"
      >
        <GameModeBadge :mode="availableMode" class="-my-1" />
        {{ t('page.tasks.shared_link.switch_mode', { mode: t(getGameModeLabel(availableMode)) }) }}
      </UButton>
    </template>
  </UAlert>
</template>
<script setup lang="ts">
  import GameModeBadge from '@/components/GameModeBadge.vue';
  import {
    API_GAME_MODES,
    GAME_MODE_OPTIONS,
    getGameModeLabel,
    type GameMode,
  } from '@/utils/constants';
  import { tarkovApiFetch } from '@/utils/tarkovApiFetch';
  import type { TarkovTasksCoreQueryResult } from '@/types/tarkov';
  const {
    taskId = null,
    mode = null,
    switchError,
  } = defineProps<{
    taskId?: string | null;
    mode?: GameMode | null;
    switchError: string;
  }>();
  const emit = defineEmits<{
    dismiss: [taskId: string];
    'switch-mode': [mode: GameMode];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const checkingModes = ref(true);
  const availableModes = ref<GameMode[]>([]);
  const request = new AbortController();
  const description = computed(() => {
    if (switchError) return t(switchError);
    if (checkingModes.value) return t('page.tasks.shared_link.checking_modes');
    if (availableModes.value.length) return t('page.tasks.shared_link.choose_mode');
    return t('page.tasks.shared_link.no_match');
  });
  async function findMode(candidate: GameMode, id: string) {
    try {
      const result = await tarkovApiFetch<{ data: TarkovTasksCoreQueryResult }>(
        '/api/tarkov/tasks-core',
        {
          query: { gameMode: API_GAME_MODES[candidate] },
          signal: request.signal,
          timeout: 5000,
          retry: 0,
        }
      );
      return result.data.tasks.some((task) => task.id === id) ? candidate : null;
    } catch {
      return null;
    }
  }
  onMounted(async () => {
    const id = taskId;
    if (!id || !mode) return;
    const candidates = GAME_MODE_OPTIONS.filter((option) => option.value !== mode);
    const matches = await Promise.all(candidates.map((option) => findMode(option.value, id)));
    if (request.signal.aborted) return;
    availableModes.value = matches.filter((candidate) => candidate !== null);
    checkingModes.value = false;
  });
  onBeforeUnmount(() => request.abort());
</script>
