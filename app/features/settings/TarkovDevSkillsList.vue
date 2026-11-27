<template>
  <details class="border-surface-800 group border-t pt-2">
    <summary
      class="text-info-300 hover:text-info-200 flex cursor-pointer list-none items-center justify-between gap-2 rounded py-0.5 text-xs font-semibold select-none"
    >
      <span class="truncate">{{ summaryLabel }}</span>
      <UIcon
        name="i-mdi-chevron-down"
        class="size-4 shrink-0 transition-transform group-open:rotate-180"
      />
    </summary>
    <div class="bg-surface-900/70 mt-2 overflow-hidden rounded-md border border-white/8">
      <div
        v-if="columns === 1"
        class="border-surface-800 bg-surface-900/95 text-surface-400 flex items-center justify-between gap-2 border-b px-2.5 py-1.5 text-xs font-semibold"
      >
        <span>{{ $t('settings.tarkov_dev_import.skills_details_skill') }}</span>
        <span>{{ $t('common.level') }}</span>
      </div>
      <div class="max-h-48 scrollbar-thin overflow-y-auto py-1 pr-2.5 pl-1.5">
        <div :class="listLayoutClass">
          <div
            v-for="skill in formattedSkills"
            :key="skill.id"
            class="hover:bg-surface-800/60 flex items-center justify-between gap-2 rounded px-1.5 py-1 transition-colors"
          >
            <span class="text-surface-200 min-w-0 truncate text-xs" :title="skill.label">
              {{ skill.label }}
            </span>
            <span
              class="shrink-0 rounded px-1.5 py-0.5 text-right font-mono text-xs font-semibold tabular-nums"
              :class="skill.badgeClass"
            >
              {{ skill.value }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </details>
</template>
<script setup lang="ts">
  import { MAX_SKILL_LEVEL } from '@/utils/constants';
  import { formatSkillDisplayName } from '@/utils/skillHelpers';
  const props = withDefaults(
    defineProps<{
      skills: ReadonlyArray<{ id: string; value: number }>;
      summaryLabel: string;
      columns?: 1 | 2;
    }>(),
    { columns: 1 }
  );
  const listLayoutClass = computed(() =>
    props.columns === 2
      ? 'grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2'
      : 'divide-surface-800/60 divide-y'
  );
  const formattedSkills = computed(() =>
    props.skills.map((skill) => ({
      id: skill.id,
      label: formatSkillDisplayName(skill.id),
      value: skill.value,
      badgeClass:
        skill.value >= MAX_SKILL_LEVEL
          ? 'bg-warning-500/15 text-warning-300'
          : skill.value > 0
            ? 'bg-surface-800 text-surface-100'
            : 'text-surface-500',
    }))
  );
</script>
