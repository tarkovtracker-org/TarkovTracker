<template>
  <ClientOnly>
    <TasksPage>
      <template #header>
        <TaskPageHeader />
      </template>
    </TasksPage>
    <template #fallback>
      <div class="px-3 py-6 sm:px-6">
        <div class="mx-auto max-w-350">
          <TaskPageHeader />
        </div>
      </div>
    </template>
  </ClientOnly>
</template>
<script setup lang="ts">
  import TaskPageHeader from '@/features/tasks/TaskPageHeader.vue';
  import TasksPage from '@/pages/tasks.vue';
  definePageMeta({
    usesWindowScroll: true,
  });
</script>
