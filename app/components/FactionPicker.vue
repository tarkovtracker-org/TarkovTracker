<template>
  <div
    class="grid grid-cols-2 gap-1"
    dir="ltr"
    role="group"
    :aria-label="t('game_settings.select_faction_label', 'Select faction')"
  >
    <CompactChoiceButton
      v-for="faction in factions"
      :key="faction"
      class="flex min-h-9 items-center justify-center gap-1.5 px-2 py-1.5 leading-none uppercase"
      :disabled="disabled"
      :aria-pressed="selectedFaction === faction"
      @click="selectedFaction = faction"
    >
      <span
        aria-hidden="true"
        class="size-5 shrink-0 bg-current mask-contain mask-center mask-no-repeat"
        :style="{ maskImage: `url(${getFactionIconPath(faction)})` }"
      />
      <span class="leading-none">{{ faction }}</span>
    </CompactChoiceButton>
  </div>
</template>
<script setup lang="ts">
  import CompactChoiceButton from '@/components/ui/CompactChoiceButton.vue';
  import { PMC_FACTIONS, type PMCFaction } from '@/utils/constants';
  import { getFactionIconPath } from '@/utils/factionIcons';
  defineProps<{ disabled?: boolean }>();
  const { t } = useI18n({ useScope: 'global' });
  const selectedFaction = defineModel<PMCFaction>({ required: true });
  const factions = [...PMC_FACTIONS].reverse();
</script>
