<template>
  <div class="flex flex-col divide-y divide-white/5">
    <div v-for="row in rows" :key="row.key" class="py-2">
      <TaskObjectiveItemGroup
        v-if="row.kind === 'itemGroup'"
        :title="row.title"
        :icon-name="row.iconName"
        :objectives="row.objectives"
        :optional="row.optional"
      />
      <TaskObjective v-else :objective="row.objective" />
    </div>
    <div v-if="irrelevantCount > 0" class="flex w-full items-center p-1 opacity-50">
      <UIcon name="i-mdi-eye-off" class="mr-1 h-4 w-4" />
      <i18n-t
        keypath="page.tasks.questcard.objectives_hidden"
        :plural="irrelevantCount"
        scope="global"
      >
        <template #count>{{ irrelevantCount }}</template>
        <template #uncompleted>{{ uncompletedIrrelevant }}</template>
      </i18n-t>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import TaskObjective from '@/features/tasks/TaskObjective.vue';
  import TaskObjectiveItemGroup from '@/features/tasks/TaskObjectiveItemGroup.vue';
  import type { TaskObjective as TaskObjectiveType } from '@/types/tarkov';
  const props = defineProps<{
    objectives: TaskObjectiveType[];
    irrelevantCount: number;
    uncompletedIrrelevant: number;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  type Row =
    | {
        kind: 'objective';
        key: string;
        objective: TaskObjectiveType;
      }
    | {
        kind: 'itemGroup';
        key: string;
        title: string;
        iconName: string;
        objectives: TaskObjectiveType[];
        optional: boolean;
      };
  const rows = computed<Row[]>(() => {
    // Types that should be grouped together with item display
    const itemGroupTypes = new Set(['giveItem', 'findItem', 'findQuestItem', 'giveQuestItem']);
    const findTypes = new Set(['findItem', 'findQuestItem']);
    const giveTypes = new Set(['giveItem', 'giveQuestItem']);
    // Helper to get the item ID from an objective (handles item, markerItem, and questItem)
    const getItemId = (objective: TaskObjectiveType): string | undefined => {
      return (
        objective.item?.id ||
        objective.items?.[0]?.id ||
        objective.markerItem?.id ||
        objective.questItem?.id
      );
    };
    // Helper to get group title based on category
    const getGroupTitle = (
      category: 'both' | 'findOnly' | 'giveOnly',
      foundInRaid: boolean
    ): { title: string; iconName: string } => {
      if (category === 'both') {
        return {
          title: foundInRaid
            ? t('page.tasks.questcard.find_and_hand_over_fir')
            : t('page.tasks.questcard.find_and_hand_over'),
          iconName: 'mdi-package-variant-closed',
        };
      }
      if (category === 'giveOnly') {
        return {
          title: foundInRaid
            ? t('page.tasks.questcard.hand_over_fir')
            : t('page.tasks.questcard.hand_over'),
          iconName: 'mdi-package-variant-closed',
        };
      }
      // findOnly
      return {
        title: foundInRaid ? t('page.tasks.questcard.find_fir') : t('page.tasks.questcard.find'),
        iconName: 'mdi-magnify',
      };
    };
    // First pass: analyze each item to determine what objective types it has
    // Key: itemId:foundInRaid, Value: { types, objectives }
    const itemAnalysis = new Map<
      string,
      { types: Set<string>; objectives: TaskObjectiveType[]; foundInRaid: boolean }
    >();
    props.objectives.forEach((objective) => {
      const type = objective.type ?? '';
      if (!itemGroupTypes.has(type)) return;
      const itemId = getItemId(objective);
      if (!itemId) return;
      const foundInRaid = objective.foundInRaid === true;
      const key = `${itemId}:${foundInRaid ? 1 : 0}`;
      if (!itemAnalysis.has(key)) {
        itemAnalysis.set(key, {
          types: new Set(),
          objectives: [],
          foundInRaid,
        });
      }
      const analysis = itemAnalysis.get(key)!;
      analysis.types.add(type);
      analysis.objectives.push(objective);
    });
    // Second pass: categorize items and build groups
    // Key: category:foundInRaid, Value: { objectives, category, foundInRaid }
    type Category = 'both' | 'findOnly' | 'giveOnly';
    const categoryGroups = new Map<
      string,
      { objectives: TaskObjectiveType[]; category: Category; foundInRaid: boolean }
    >();
    const firstIndexByGroup = new Map<string, number>();
    // Track which objectives belong to which group
    const objectiveToGroup = new Map<string, string>();
    itemAnalysis.forEach((analysis, _itemKey) => {
      const hasFind = [...analysis.types].some((t) => findTypes.has(t));
      const hasGive = [...analysis.types].some((t) => giveTypes.has(t));
      let category: Category;
      if (hasFind && hasGive) {
        category = 'both';
      } else if (hasGive) {
        category = 'giveOnly';
      } else {
        category = 'findOnly';
      }
      const groupKey = `${category}:${analysis.foundInRaid ? 1 : 0}`;
      if (!categoryGroups.has(groupKey)) {
        categoryGroups.set(groupKey, {
          objectives: [],
          category,
          foundInRaid: analysis.foundInRaid,
        });
      }
      const group = categoryGroups.get(groupKey)!;
      analysis.objectives.forEach((obj) => {
        group.objectives.push(obj);
        objectiveToGroup.set(obj.id, groupKey);
      });
    });
    // Find first index for each group
    props.objectives.forEach((objective, index) => {
      const groupKey = objectiveToGroup.get(objective.id);
      if (groupKey && !firstIndexByGroup.has(groupKey)) {
        firstIndexByGroup.set(groupKey, index);
      }
    });
    // Third pass: build output, inserting groups at first occurrence
    const out: Row[] = [];
    const inserted = new Set<string>();
    props.objectives.forEach((objective, index) => {
      const groupKey = objectiveToGroup.get(objective.id);
      if (groupKey) {
        if (!inserted.has(groupKey) && firstIndexByGroup.get(groupKey) === index) {
          const group = categoryGroups.get(groupKey)!;
          const config = getGroupTitle(group.category, group.foundInRaid);
          out.push({
            kind: 'itemGroup',
            key: `group:${groupKey}`,
            title: config.title,
            iconName: config.iconName,
            objectives: group.objectives,
            optional: group.objectives.every((o) => o.optional === true),
          });
          inserted.add(groupKey);
        }
        return;
      }
      out.push({
        kind: 'objective',
        key: objective.id,
        objective,
      });
    });
    return out;
  });
</script>
