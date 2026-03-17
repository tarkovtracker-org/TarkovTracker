<template>
  <div class="min-h-[1100px] w-full space-y-6">
    <div class="space-y-3">
      <div class="bg-panel border-border shadow-card space-y-3 rounded-lg border px-3 py-3 sm:px-4">
        <div class="flex flex-wrap items-center gap-3">
          <div class="bg-interactive h-9 w-full rounded-md sm:w-56 lg:w-72"></div>
          <div class="flex flex-1 items-center justify-center gap-2">
            <div class="bg-interactive h-8 w-16 rounded-md sm:w-20"></div>
            <div class="bg-interactive h-8 w-16 rounded-md sm:w-20"></div>
            <div class="bg-interactive h-8 w-16 rounded-md sm:w-20"></div>
            <div class="bg-interactive hidden h-8 w-16 rounded-md sm:w-20 lg:block"></div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <div class="bg-interactive h-9 w-28 rounded-md sm:w-44"></div>
            <div class="bg-interactive h-9 w-9 rounded-md"></div>
            <div class="bg-interactive h-9 w-9 rounded-md"></div>
          </div>
        </div>
      </div>
      <div
        class="bg-panel border-border shadow-card flex flex-wrap items-center gap-2 rounded-lg border px-3 py-3 sm:px-4"
      >
        <div v-for="i in 6" :key="`status-${i}`" class="bg-interactive h-8 w-24 rounded-md"></div>
      </div>
    </div>
    <div class="bg-panel border-border shadow-card rounded-lg border p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="space-y-2">
          <div class="bg-interactive h-5 w-40 rounded"></div>
          <div class="bg-interactive h-3 w-72 max-w-full rounded"></div>
        </div>
        <div class="bg-interactive h-8 w-8 rounded-md"></div>
      </div>
    </div>
    <div class="space-y-4">
      <div
        v-for="i in 4"
        :key="i"
        class="bg-panel border-border shadow-card animate-pulse rounded-lg border p-4 sm:p-5"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 items-start gap-3">
            <div class="bg-interactive h-10 w-10 shrink-0 rounded-full"></div>
            <div class="min-w-0 space-y-2">
              <div class="bg-interactive h-4 w-48 max-w-full rounded sm:w-64"></div>
              <div class="bg-interactive h-3 w-24 rounded"></div>
            </div>
          </div>
          <div class="bg-interactive h-8 w-20 shrink-0 rounded-md"></div>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <div class="bg-interactive h-6 w-16 rounded-full"></div>
          <div class="bg-interactive h-6 w-24 rounded-full"></div>
          <div class="bg-interactive h-6 w-20 rounded-full"></div>
        </div>
        <div class="mt-4 space-y-3">
          <div class="bg-interactive h-10 w-full rounded-md"></div>
          <div class="bg-interactive h-10 w-full rounded-md"></div>
          <div class="bg-interactive h-10 w-full rounded-md"></div>
        </div>
        <div class="mt-4 flex items-center gap-2">
          <div class="bg-interactive h-8 w-24 rounded-md"></div>
          <div class="bg-interactive h-8 w-24 rounded-md"></div>
          <div class="bg-interactive h-8 w-24 rounded-md"></div>
        </div>
      </div>
    </div>
    <div class="flex items-center justify-center py-2">
      <UIcon name="i-mdi-loading" class="text-foreground-subtle mr-2 h-5 w-5 animate-spin" />
      <span class="text-foreground-subtle text-sm">{{ t('page.tasks.loading') }}</span>
    </div>
  </div>
</template>
<script setup lang="ts">
  const { t } = useI18n({ useScope: 'global' });
</script>
