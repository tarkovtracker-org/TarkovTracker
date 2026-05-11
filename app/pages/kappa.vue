<template>
  <div class="flex min-h-full flex-col px-3 py-6 sm:px-6">
    <div class="mx-auto w-full max-w-[1400px]">
      <!-- Header -->
      <div class="mb-6">
        <div class="flex items-center gap-3">
          <span
            class="bg-kappa/15 border-kappa/25 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
          >
            <UIcon name="i-mdi-trophy" class="text-kappa h-5 w-5" />
          </span>
          <div>
            <h1 class="text-2xl font-bold text-white">
              {{ t('page.kappa.title') }}
            </h1>
            <p class="text-surface-400 text-sm">
              {{ t('page.kappa.subtitle') }}
            </p>
          </div>
        </div>
      </div>
      <!-- Stats -->
      <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="bg-surface-800/50 rounded-lg border border-white/5 p-3">
          <div class="text-surface-400 text-xs font-medium tracking-wide uppercase">
            {{ t('page.kappa.stats.total') }}
          </div>
          <div class="mt-1 text-2xl font-bold text-white">
            {{ kappaTasks.length }}
          </div>
        </div>
        <div class="bg-surface-800/50 rounded-lg border border-white/5 p-3">
          <div class="text-surface-400 text-xs font-medium tracking-wide uppercase">
            {{ t('page.kappa.stats.completed') }}
          </div>
          <div class="text-success-400 mt-1 text-2xl font-bold">
            {{ kappaCompleted }}
          </div>
        </div>
        <div class="bg-surface-800/50 rounded-lg border border-white/5 p-3">
          <div class="text-surface-400 text-xs font-medium tracking-wide uppercase">
            {{ t('page.kappa.stats.lightkeeper_total') }}
          </div>
          <div class="mt-1 text-2xl font-bold text-white">
            {{ lightkeeperTasks.length }}
          </div>
        </div>
        <div class="bg-surface-800/50 rounded-lg border border-white/5 p-3">
          <div class="text-surface-400 text-xs font-medium tracking-wide uppercase">
            {{ t('page.kappa.stats.lightkeeper_completed') }}
          </div>
          <div class="text-lightkeeper mt-1 text-2xl font-bold">
            {{ lightkeeperCompleted }}
          </div>
        </div>
      </div>
      <!-- Tab toggle -->
      <div class="mb-4 flex gap-2">
        <UButton
          :variant="activeTab === 'kappa' ? 'solid' : 'outline'"
          color="primary"
          size="sm"
          @click="activeTab = 'kappa'"
        >
          <UIcon name="i-mdi-trophy" class="mr-1.5 h-4 w-4" />
          {{ t('page.kappa.tabs.kappa') }} ({{ kappaTasks.length }})
        </UButton>
        <UButton
          :variant="activeTab === 'lightkeeper' ? 'solid' : 'outline'"
          color="info"
          size="sm"
          @click="activeTab = 'lightkeeper'"
        >
          <UIcon name="i-mdi-lighthouse" class="mr-1.5 h-4 w-4" />
          {{ t('page.kappa.tabs.lightkeeper') }} ({{ lightkeeperTasks.length }})
        </UButton>
      </div>
      <!-- Progress bar -->
      <div class="mb-6">
        <div class="bg-surface-800 h-2 overflow-hidden rounded-full">
          <div
            class="h-full rounded-full transition-all duration-300"
            :class="activeTab === 'kappa' ? 'bg-kappa' : 'bg-lightkeeper'"
            :style="{ width: `${progressPercent}%` }"
          />
        </div>
        <div class="text-surface-400 mt-1 text-right text-xs">
          {{ progressPercent }}% {{ t('page.kappa.progress_label') }}
        </div>
      </div>
      <!-- Task list -->
      <div class="space-y-3">
        <TaskCard
          v-for="task in displayedTasks"
          :key="task.id"
          :task="task"
          @on-task-action="handleTaskAction"
        />
      </div>
      <div v-if="displayedTasks.length === 0" class="py-12 text-center">
        <UIcon name="i-mdi-check-circle-outline" class="text-success-400 mx-auto mb-3 h-12 w-12" />
        <p class="text-surface-300 text-lg font-medium">
          {{ t('page.kappa.all_complete') }}
        </p>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import TaskCard from '@/features/tasks/TaskCard.vue';
  const { t } = useI18n({ useScope: 'global' });
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const activeTab = ref<'kappa' | 'lightkeeper'>('kappa');
  const kappaTasks = computed(() => metadataStore.tasks.filter((task) => task.kappaRequired));
  const lightkeeperTasks = computed(() =>
    metadataStore.tasks.filter((task) => task.lightkeeperRequired)
  );
  const displayedTasks = computed(() =>
    activeTab.value === 'kappa' ? kappaTasks.value : lightkeeperTasks.value
  );
  const kappaCompleted = computed(
    () => kappaTasks.value.filter((task) => tarkovStore.isTaskComplete(task.id)).length
  );
  const lightkeeperCompleted = computed(
    () => lightkeeperTasks.value.filter((task) => tarkovStore.isTaskComplete(task.id)).length
  );
  const progressPercent = computed(() => {
    const tasks = activeTab.value === 'kappa' ? kappaTasks.value : lightkeeperTasks.value;
    const completed =
      activeTab.value === 'kappa' ? kappaCompleted.value : lightkeeperCompleted.value;
    return tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;
  });
  function handleTaskAction(_action: unknown) {
    // Task actions handled by TaskCard internally
  }
  useSeoMeta({
    title: () => t('page.kappa.title'),
    description: () => t('page.kappa.subtitle'),
  });
</script>
