<template>
  <aside class="hidden lg:block">
    <div class="sticky top-16 space-y-3">
      <p class="text-surface-400 text-xs font-semibold tracking-[0.2em] uppercase">
        {{ t('page.resources.on_this_page', 'On this page') }}
      </p>
      <nav class="space-y-1" :aria-label="t('page.resources.on_this_page', 'On this page')">
        <a
          v-for="item in items"
          :key="item.id"
          :href="`#${item.id}`"
          :class="[
            'focus-visible:ring-primary-400/40 block rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
            activeId === item.id
              ? 'bg-primary-500/15 text-primary-200'
              : 'text-surface-300 hover:text-primary-300 hover:bg-white/5',
          ]"
          @click="$emit('select', item.id, $event)"
        >
          {{ item.label }}
        </a>
      </nav>
    </div>
  </aside>
</template>
<script setup lang="ts">
  export interface ResourceGuideTocItem {
    id: string;
    label: string;
  }
  defineProps<{ items: ResourceGuideTocItem[]; activeId: string }>();
  defineEmits<{ select: [id: string, event: MouseEvent] }>();
  const { t } = useI18n({ useScope: 'global' });
</script>
