<template>
  <ul
    class="text-surface-400 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs"
    :class="centered ? 'justify-center' : ''"
  >
    <li v-for="line in lines" :key="line.key" class="inline-flex items-center gap-1">
      <span class="sr-only">{{ line.spoken }}</span>
      <UIcon :name="icons[line.source]" class="size-3.5" aria-hidden="true" />
      <span aria-hidden="true">{{ line.label }}</span>
      <span v-if="line.fir" class="text-warning-300 font-semibold" aria-hidden="true">
        {{ firLabel }}
      </span>
      <span class="text-surface-200 font-semibold tabular-nums" aria-hidden="true">
        {{ line.progress }}
      </span>
    </li>
  </ul>
</template>
<script setup lang="ts">
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  export interface BreakdownSection {
    key: string;
    source: 'tasks' | 'hideout';
    fir: boolean;
    current: number;
    total: number;
  }
  const props = defineProps<{ sections: BreakdownSection[]; centered?: boolean }>();
  const icons = { tasks: 'i-mdi-clipboard-text-outline', hideout: 'i-mdi-home-outline' };
  const { t } = useI18n({ useScope: 'global' });
  const formatNumber = useLocaleNumberFormatter();
  const firLabel = computed(() => t('common.fir'));
  const lines = computed(() =>
    props.sections.map((section) => {
      const label = t(`common.${section.source}`);
      const progress = `${formatNumber(section.current)}/${formatNumber(section.total)}`;
      const words = section.fir ? [label, firLabel.value, progress] : [label, progress];
      return { ...section, label, progress, spoken: words.join(' ') };
    })
  );
</script>
