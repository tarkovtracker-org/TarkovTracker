<template>
  <form class="min-w-0" novalidate @submit.prevent="saveLevel">
    <UFormField
      name="player-level"
      :label="$t('settings.player_level.label')"
      :help="rangeHint"
      :error="errorMessage"
      class="max-w-sm"
    >
      <div class="flex flex-wrap items-start gap-2.5">
        <UInput
          v-model="draft"
          type="number"
          inputmode="numeric"
          step="1"
          :min="minLevel"
          :max="maxLevel"
          name="player-level"
          class="w-20"
        />
        <UButton
          type="submit"
          icon="i-mdi-check"
          color="primary"
          variant="soft"
          size="sm"
          class="min-w-24"
          :disabled="!canApply"
        >
          {{ $t('common.apply') }}
        </UButton>
      </div>
      <template #help>
        <span class="grid wrap-anywhere">
          <span aria-hidden="true" class="invisible col-start-1 row-start-1">
            {{
              $t('settings.player_level.range_hint_fallback', {
                min: minLevel,
                max: maxLevel,
              })
            }}
          </span>
          <span class="col-start-1 row-start-1">{{ rangeHint }}</span>
        </span>
      </template>
    </UFormField>
  </form>
</template>
<script setup lang="ts">
  import { usePlayerLevelEditor } from '@/composables/usePlayerLevelEditor';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { getGameModeLabel } from '@/utils/constants';
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const tarkovStore = useTarkovStore();
  // Mode switches and hydration reset the draft synchronously, so Apply always targets this mode.
  const { applyDraft, canApply, draft, errorMessage, hasLevelMetadata, maxLevel, minLevel } =
    usePlayerLevelEditor();
  const modeLabel = computed(() => t(getGameModeLabel(tarkovStore.getCurrentGameMode())));
  const rangeHint = computed(() => {
    const key = hasLevelMetadata.value
      ? 'settings.player_level.range_hint'
      : 'settings.player_level.range_hint_fallback';
    return t(key, { min: minLevel.value, max: maxLevel.value });
  });
  function saveLevel(): void {
    if (!canApply.value || !applyDraft()) return;
    toast.add({
      title: t('settings.player_level.saved_title'),
      description: t('settings.player_level.saved_description', {
        mode: modeLabel.value,
        level: tarkovStore.playerLevel(),
      }),
      color: 'success',
    });
  }
</script>
