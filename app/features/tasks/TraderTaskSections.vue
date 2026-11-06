<template>
  <div>
    <div
      v-for="group in groups"
      :key="group.section ?? 'flat'"
      :data-testid="group.section ? `trader-task-section-${group.section}` : undefined"
      :class="group.section ? sectionGapClass : undefined"
    >
      <div v-if="group.section" class="mb-3 flex items-center gap-2">
        <div class="bg-surface-700 h-px flex-1" />
        <div class="flex min-w-0 flex-col items-center text-center">
          <div class="flex items-center gap-2">
            <UIcon :name="SECTION_ICONS[group.section]" class="text-primary-400 h-4 w-4" />
            <h3 class="text-surface-200 text-sm font-medium">
              {{ sectionTitle(group.section) }}
            </h3>
          </div>
          <p v-if="sectionHint(group.section)" class="text-surface-400 text-xs">
            {{ sectionHint(group.section) }}
          </p>
        </div>
        <div class="bg-surface-700 h-px flex-1" />
      </div>
      <div v-for="task in group.tasks" :key="`task-${task.id}`" :class="cardGapClass">
        <TaskCard :task="task" @on-task-action="$emit('on-task-action', $event)" />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import TaskCard from '@/features/tasks/TaskCard.vue';
  import {
    groupTasksByTraderSection,
    type TraderTaskSection,
  } from '@/features/tasks/traderTaskGroups';
  import type { TaskActionPayload } from '@/composables/useTaskActions';
  import type { Task } from '@/types/tarkov';
  const props = defineProps<{
    tasks: Task[];
    /** False renders one plain list with no section headings. */
    grouped: boolean;
    sectionGapClass?: string;
    cardGapClass?: string;
  }>();
  defineEmits<{ 'on-task-action': [payload: TaskActionPayload] }>();
  const { t } = useI18n({ useScope: 'global' });
  const SECTION_ICONS: Record<TraderTaskSection, string> = {
    ll1: 'i-mdi-roman-numeral-1',
    ll2: 'i-mdi-roman-numeral-2',
    ll3: 'i-mdi-roman-numeral-3',
    ll4: 'i-mdi-roman-numeral-4',
    essential: 'i-mdi-format-list-bulleted',
    other: 'i-mdi-help-circle-outline',
  };
  const LOYALTY_LEVEL: Partial<Record<TraderTaskSection, number>> = {
    ll1: 1,
    ll2: 2,
    ll3: 3,
    ll4: 4,
  };
  const groups = computed<Array<{ section: TraderTaskSection | null; tasks: Task[] }>>(() =>
    props.grouped ? groupTasksByTraderSection(props.tasks) : [{ section: null, tasks: props.tasks }]
  );
  const sectionTitle = (section: TraderTaskSection): string => {
    const level = LOYALTY_LEVEL[section];
    if (level) return t('page.tasks.trader_sections.loyalty_level', { level });
    return t(`page.tasks.trader_sections.${section}`);
  };
  const sectionHint = (section: TraderTaskSection): string =>
    LOYALTY_LEVEL[section] ? '' : t(`page.tasks.trader_sections.${section}_hint`);
</script>
