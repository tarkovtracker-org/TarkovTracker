<template>
  <div>
    <UAlert
      v-if="!countedTasks.length"
      icon="i-mdi-clipboard-text-off-outline"
      color="neutral"
      variant="soft"
      :title="t('page.profile.no_tasks')"
    />
    <div v-else class="space-y-4">
      <div v-for="section in sections" :key="section.key">
        <button
          v-if="section.tasks.length"
          type="button"
          class="mb-2 flex w-full items-center gap-2 text-left"
          @click="toggleSection(section.key)"
        >
          <div
            class="flex h-8 w-8 items-center justify-center rounded-md"
            :class="section.chipClass"
          >
            <UIcon :name="section.icon" class="h-5 w-5" :class="section.iconClass" />
          </div>
          <span class="text-surface-100 text-sm font-semibold">{{ section.label }}</span>
          <UBadge color="neutral" variant="soft" size="xs">
            {{ section.tasks.length }}
          </UBadge>
          <UIcon
            name="i-mdi-chevron-down"
            class="text-surface-400 ml-auto h-5 w-5 transition-transform duration-200"
            :class="collapsedSections.has(section.key) ? '-rotate-90' : ''"
          />
        </button>
        <div
          v-if="section.tasks.length && !collapsedSections.has(section.key)"
          class="bg-surface-900 rounded-lg border border-white/10"
        >
          <div v-for="(task, idx) in section.tasks" :key="task.id">
            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-2 text-left"
              :class="[
                idx !== section.tasks.length - 1 && !expandedTasks.has(task.id)
                  ? 'border-b border-white/5'
                  : '',
                isTaskSuccessful(task.id) ? 'opacity-50' : '',
              ]"
              @click="toggleTask(task.id)"
            >
              <UIcon
                :name="taskStatusIcon(task.id)"
                class="h-4 w-4 shrink-0"
                :class="taskStatusColor(task.id)"
              />
              <span class="text-surface-200 min-w-0 flex-1 truncate text-sm">
                {{ task.name || t('page.profile.task_fallback') }}
              </span>
              <span
                v-if="task.trader?.name"
                class="text-surface-500 hidden shrink-0 text-xs sm:inline"
              >
                {{ task.trader.name }}
              </span>
              <UBadge
                v-if="task.minPlayerLevel && task.minPlayerLevel > 1"
                color="neutral"
                variant="soft"
                size="xs"
                class="shrink-0"
              >
                {{ t('page.profile.level_prefix') }}{{ task.minPlayerLevel }}
              </UBadge>
              <UIcon
                v-if="task.kappaRequired"
                name="i-mdi-trophy"
                class="text-kappa-400 h-3.5 w-3.5 shrink-0"
              />
              <UIcon
                v-if="task.lightkeeperRequired"
                name="i-mdi-lighthouse"
                class="text-lightkeeper-400 h-3.5 w-3.5 shrink-0"
              />
              <UIcon
                name="i-mdi-chevron-down"
                class="text-surface-500 h-4 w-4 shrink-0 transition-transform duration-200"
                :class="expandedTasks.has(task.id) ? 'rotate-180' : ''"
              />
            </button>
            <div
              v-if="expandedTasks.has(task.id)"
              class="border-b border-white/5 px-3 pb-3"
              :class="idx !== section.tasks.length - 1 ? '' : 'border-b-0'"
            >
              <div
                v-if="task.objectives?.length"
                class="bg-surface-950/50 ml-6 space-y-1 rounded-md border border-white/5 p-2"
              >
                <div
                  v-for="objective in task.objectives"
                  :key="objective.id"
                  class="flex items-start gap-2"
                >
                  <UIcon
                    :name="objectiveIcon(objective.id)"
                    class="mt-0.5 h-3.5 w-3.5 shrink-0"
                    :class="objectiveColor(objective.id)"
                  />
                  <span class="text-surface-300 text-xs leading-relaxed">
                    {{ objective.description || t('page.profile.objective_fallback') }}
                  </span>
                  <span
                    v-if="objective.count && objective.count > 1"
                    class="text-surface-500 ml-auto shrink-0 text-xs"
                  >
                    {{ objectiveCount(objective.id) }}/{{ objective.count }}
                  </span>
                </div>
              </div>
              <div v-else class="text-surface-500 ml-6 py-1 text-xs">
                {{ t('page.profile.no_objectives') }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import type { Task } from '@/types/tarkov';
  interface ObjectiveCompletion {
    complete?: boolean;
    count?: number;
    timestamp?: number;
  }
  interface Props {
    countedTasks: Task[];
    isTaskSuccessful: (taskId: string) => boolean;
    isTaskFailed: (taskId: string) => boolean;
    isTaskLocked: (taskId: string) => boolean;
    objectiveCompletions: Record<string, ObjectiveCompletion>;
  }
  const props = defineProps<Props>();
  const { t } = useI18n({ useScope: 'global' });
  const collapsedSections = ref(new Set<string>());
  const expandedTasks = ref(new Set<string>());
  const toggleSection = (key: string) => {
    const next = new Set(collapsedSections.value);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    collapsedSections.value = next;
  };
  const toggleTask = (taskId: string) => {
    const next = new Set(expandedTasks.value);
    if (next.has(taskId)) {
      next.delete(taskId);
    } else {
      next.add(taskId);
    }
    expandedTasks.value = next;
  };
  interface StatusSection {
    key: string;
    label: string;
    icon: string;
    chipClass: string;
    iconClass: string;
    tasks: Task[];
  }
  const sections = computed<StatusSection[]>(() => {
    const available: Task[] = [];
    const locked: Task[] = [];
    const completed: Task[] = [];
    for (const task of props.countedTasks) {
      if (props.isTaskSuccessful(task.id) || props.isTaskFailed(task.id)) {
        completed.push(task);
      } else if (props.isTaskLocked(task.id)) {
        locked.push(task);
      } else {
        available.push(task);
      }
    }
    return [
      {
        key: 'available',
        label: t('page.profile.section_available'),
        icon: 'i-mdi-clipboard-check-outline',
        chipClass: 'bg-primary-700/25',
        iconClass: 'text-primary-300',
        tasks: available,
      },
      {
        key: 'locked',
        label: t('page.profile.section_locked'),
        icon: 'i-mdi-lock-outline',
        chipClass: 'bg-warning-700/25',
        iconClass: 'text-warning-300',
        tasks: locked,
      },
      {
        key: 'completed',
        label: t('page.profile.section_completed'),
        icon: 'i-mdi-check-circle-outline',
        chipClass: 'bg-success-700/25',
        iconClass: 'text-success-300',
        tasks: completed,
      },
    ];
  });
  const taskStatusIcon = (taskId: string): string => {
    if (props.isTaskFailed(taskId)) return 'i-mdi-close-circle';
    if (props.isTaskSuccessful(taskId)) return 'i-mdi-check-circle';
    if (props.isTaskLocked(taskId)) return 'i-mdi-lock';
    return 'i-mdi-circle-outline';
  };
  const taskStatusColor = (taskId: string): string => {
    if (props.isTaskFailed(taskId)) return 'text-error-400';
    if (props.isTaskSuccessful(taskId)) return 'text-success-400';
    if (props.isTaskLocked(taskId)) return 'text-warning-400';
    return 'text-primary-400';
  };
  const objectiveIcon = (objectiveId: string): string => {
    return props.objectiveCompletions[objectiveId]?.complete
      ? 'i-mdi-check-circle'
      : 'i-mdi-circle-outline';
  };
  const objectiveColor = (objectiveId: string): string => {
    return props.objectiveCompletions[objectiveId]?.complete
      ? 'text-success-400'
      : 'text-surface-500';
  };
  const objectiveCount = (objectiveId: string): number => {
    return props.objectiveCompletions[objectiveId]?.count ?? 0;
  };
</script>
