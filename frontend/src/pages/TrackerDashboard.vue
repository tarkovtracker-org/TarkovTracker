<template>
  <v-container class="mt-2 d-flex flex-column" style="min-height: calc(100vh - 250px)">
    <v-alert
      density="compact"
      color="green-darken-4"
      title="Project Status"
      class="mb-6"
      style="flex: 0 0 auto"
    >
      This is a community-maintained fork of the original TarkovTracker.io project. Updated data
      will be automatically pulled from
      <a href="http://tarkov.dev/" target="_blank">tarkov.dev</a> as changes are discovered and
      confirmed. Contributions and bug reports are welcome on the
      <a href="https://github.com/tarkovtracker-org/TarkovTracker" target="_blank"
        >GitHub repo fork</a
      >
      to help keep the project up to date.
    </v-alert>
    <v-row justify="center">
      <v-col cols="12" sm="8" md="6" lg="4" xl="3">
        <tracker-stat icon="mdi-progress-check">
          <template #stat>
            {{ t('page.dashboard.stats.allTasks.stat') }}
          </template>
          <template #value> {{ completedTasks }}/{{ totalTasks }} </template>
          <template #percentage>
            {{ totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : '0.0' }}%
          </template>
          <template #details>
            {{ t('page.dashboard.stats.allTasks.details') }}
          </template>
        </tracker-stat>
      </v-col>
      <v-col cols="12" sm="8" md="6" lg="4" xl="3">
        <tracker-stat icon="mdi-briefcase-search">
          <template #stat>
            {{ t('page.dashboard.stats.allObjectives.stat') }}
          </template>
          <template #value> {{ completedObjectives }}/{{ totalObjectives }} </template>
          <template #percentage>
            {{
              totalObjectives > 0
                ? ((completedObjectives / totalObjectives) * 100).toFixed(1)
                : '0.0'
            }}%
          </template>
          <template #details>
            {{ t('page.dashboard.stats.allObjectives.details') }}
          </template>
        </tracker-stat>
      </v-col>
      <v-col cols="12" sm="8" md="6" lg="4" xl="3">
        <tracker-stat icon="mdi-briefcase-search">
          <template #stat>
            {{ t('page.dashboard.stats.taskItems.stat') }}
          </template>
          <template #value> {{ completedTaskItems }}/{{ totalTaskItems }} </template>
          <template #percentage>
            {{
              totalTaskItems > 0 ? ((completedTaskItems / totalTaskItems) * 100).toFixed(1) : '0.0'
            }}%
          </template>
          <template #details>
            {{ t('page.dashboard.stats.taskItems.details') }}
          </template>
        </tracker-stat>
      </v-col>
    </v-row>
  </v-container>
</template>
<script setup>
  import { useTarkovData } from '@/composables/tarkovdata';
  import { useProgressStore } from '@/stores/progress';
  import { useTarkovStore } from '@/stores/tarkov';
  import { computed, defineAsyncComponent } from 'vue';
  import { useI18n } from 'vue-i18n';
  const { t } = useI18n({ useScope: 'global' });
  const TrackerStat = defineAsyncComponent(() => import('@/components/TrackerStat'));
  const { tasks, objectives } = useTarkovData();
  const progressStore = useProgressStore();
  const tarkovStore = useTarkovStore();
  const neededItemTaskObjectives = computed(() => {
    if (!objectives || !objectives.value) {
      return [];
    }
    // Filter objectives to include only those that involve items relevant for counting
    const itemObjectiveTypes = [
      'giveItem',
      'findItem',
      'findQuestItem',
      'giveQuestItem',
      'plantQuestItem',
      'plantItem',
      'buildWeapon',
    ];
    return objectives.value.filter((obj) => obj && itemObjectiveTypes.includes(obj.type));
  });
  const totalTasks = computed(() => {
    if (!tasks.value) {
      return 0; // Return 0 if tasks data isn't loaded yet
    }
    let relevantTasks = tasks.value.filter(
      (task) =>
        // Ensure task exists and has factionName before filtering
        task && (task.factionName == 'Any' || task.factionName == tarkovStore.getPMCFaction)
    ).length;
    // Find all tasks with alternatives and subtract n-1 from the total
    // Ensure tasks.value exists before filtering
    let tasksWithAlternatives = tasks.value
      ? tasks.value.filter(
          // Ensure task exists and has alternatives before checking length
          (task) => task && task.alternatives && task.alternatives.length > 0
        )
      : []; // Default to empty array if tasks.value is null
    // Ensure tasksWithAlternatives is valid before iterating
    if (tasksWithAlternatives && tasksWithAlternatives.length > 0) {
      tasksWithAlternatives.forEach((task) => {
        // Ensure task and alternatives exist
        if (task && task.alternatives) {
          relevantTasks -= task.alternatives.length - 1;
          // Ensure alternatives exist before iterating
          if (task.alternatives.length > 0) {
            task.alternatives.forEach((alternative) => {
              tasksWithAlternatives = tasksWithAlternatives.filter(
                (t) => t && t.id != alternative // Ensure iterated task 't' exists
              );
            });
          }
        }
      });
    }
    return relevantTasks;
  });
  const totalObjectives = computed(() => {
    if (!tasks.value) {
      // Check if tasks data is loaded
      return 0;
    }
    let total = 0;
    tasks.value
      .filter(
        (task) =>
          // Ensure task exists before filtering
          task && (task.factionName == 'Any' || task.factionName == tarkovStore.getPMCFaction)
      )
      .forEach((task) => {
        // Check if task and task.objectives exist before accessing length
        if (task && task.objectives) {
          total += task.objectives.length;
        }
      });
    return total;
  });
  const completedObjectives = computed(() => {
    if (!objectives || !objectives.value || !tarkovStore) {
      return 0;
    }
    return objectives.value.filter(
      (objective) =>
        // Ensure objective and its id exist before checking completion
        objective && objective.id && tarkovStore.isTaskObjectiveComplete(objective.id)
    ).length;
  });
  const completedTasks = computed(() => {
    // Check if progressStore.tasksCompletions exists before getting values
    if (!progressStore.tasksCompletions) {
      return 0;
    }
    return Object.values(progressStore.tasksCompletions).filter(
      (task) => task && task.self === true // Ensure task exists before checking self property
    ).length;
  });
  const completedTaskItems = computed(() => {
    // Restore the original guard and logic
    if (
      !neededItemTaskObjectives.value || // Use neededItemTaskObjectives here
      !tasks.value ||
      !progressStore.tasksCompletions ||
      !progressStore.objectiveCompletions ||
      !tarkovStore
    ) {
      return 0; // Return 0 if data isn't loaded yet
    }
    let total = 0;
    neededItemTaskObjectives.value.forEach((objective) => {
      // Iterate over neededItemTaskObjectives
      // Ensure objective exists before proceeding
      if (!objective) return;
      // Check for item and item.id
      if (
        objective.item &&
        [
          '5696686a4bdc2da3298b456a',
          '5449016a4bdc2d6f028b456f',
          '569668774bdc2da2298b4568',
        ].includes(objective.item.id)
      ) {
        return;
      }
      let relatedTask = tasks.value.find(
        (task) => task && objective.taskId && task.id === objective.taskId
      );
      const currentPMCFaction = tarkovStore.getPMCFaction;
      if (
        !relatedTask ||
        !relatedTask.factionName ||
        currentPMCFaction === undefined ||
        (relatedTask.factionName != 'Any' && relatedTask.factionName != currentPMCFaction)
      ) {
        return;
      }
      if (!objective.id || !objective.taskId) return;
      const taskCompletion = progressStore.tasksCompletions[objective.taskId];
      const objectiveCompletion = progressStore.objectiveCompletions[objective.id];
      if (
        (taskCompletion && taskCompletion['self']) ||
        (objectiveCompletion && objectiveCompletion['self']) ||
        (objective.count &&
          objective.id &&
          objective.count <= tarkovStore.getObjectiveCount(objective.id))
      ) {
        total += objective.count || 1;
      } else {
        if (objective.id) {
          total += tarkovStore.getObjectiveCount(objective.id);
        }
      }
    });
    return total;
  });
  const totalTaskItems = computed(() => {
    if (!objectives || !objectives.value || !tasks.value || !tarkovStore) {
      return 0;
    }
    let total = 0;
    neededItemTaskObjectives.value.forEach((objective) => {
      // Iterate over neededItemTaskObjectives
      // Ensure objective exists before proceeding
      if (!objective) return;
      // Check for item and item.id
      if (
        objective.item &&
        [
          '5696686a4bdc2da3298b456a',
          '5449016a4bdc2d6f028b456f',
          '569668774bdc2da2298b4568',
        ].includes(objective.item.id)
      ) {
        return;
      }
      let relatedTask = tasks.value.find(
        (task) => task && objective.taskId && task.id === objective.taskId
      );
      const currentPMCFaction = tarkovStore.getPMCFaction;
      if (
        !relatedTask ||
        !relatedTask.factionName ||
        currentPMCFaction === undefined ||
        (relatedTask.factionName != 'Any' && relatedTask.factionName != currentPMCFaction)
      ) {
        return;
      }
      if (objective.count) {
        total += objective.count;
      } else {
        total += 1;
      }
    });
    return total;
  });
</script>
<style lang="scss" scoped></style>
