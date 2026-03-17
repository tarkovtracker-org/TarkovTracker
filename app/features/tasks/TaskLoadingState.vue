<template>
  <div class="w-full space-y-4">
    <div class="flex items-center justify-center py-2">
      <UIcon name="i-mdi-loading" class="text-foreground-subtle mr-2 h-5 w-5 animate-spin" />
      <span class="text-foreground-subtle text-sm">{{ t('page.tasks.loading') }}</span>
    </div>
    <div class="space-y-4">
      <div
        v-for="i in 3"
        :key="i"
        class="bg-panel border-border shadow-card animate-pulse rounded-lg border p-4"
      >
        <div class="flex items-center gap-3">
          <div class="bg-interactive h-9 w-9 rounded-full"></div>
          <div class="flex-1 space-y-2">
            <div class="bg-interactive h-4 w-3/4 rounded"></div>
            <div class="bg-interactive h-3 w-1/2 rounded"></div>
          </div>
        </div>
        <div class="mt-4 space-y-2">
          <div class="bg-interactive h-3 w-full rounded"></div>
          <div class="bg-interactive h-3 w-5/6 rounded"></div>
        </div>
      </div>
    </div>
    <div class="flex justify-center">
      <refresh-button />
    </div>
  </div>
</template>
<script setup lang="ts">
  import RefreshButton from '@/components/ui/RefreshButton.vue';
  const { t } = useI18n({ useScope: 'global' });
</script>
