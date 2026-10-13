<template>
  <div
    class="bg-surface-900 border-surface-700/80 absolute top-full left-0 z-50 mt-1 max-h-[70vh] w-full min-w-72 overflow-y-auto rounded-xl border p-1.5 shadow-2xl"
    @mousedown.prevent
  >
    <div :id="props.listboxId" role="listbox" :aria-label="props.label">
      <div
        v-for="group in props.groups"
        :key="group.id"
        role="group"
        :aria-labelledby="`${props.listboxId}-${group.id}`"
      >
        <div
          :id="`${props.listboxId}-${group.id}`"
          class="text-surface-450 px-2 py-1 text-[10px] font-semibold tracking-wider uppercase"
        >
          {{ group.label }}
        </div>
        <div
          v-for="option in group.options"
          :id="option.domId"
          :key="option.domId"
          role="option"
          :aria-selected="option.index === props.activeIndex"
          class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs"
          :class="optionClass(option)"
          data-testid="app-search-option"
          @mousemove="emit('hover', option.index)"
          @click="emit('select', option)"
        >
          <UIcon :name="option.icon" class="size-4 shrink-0" />
          <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
          <span v-if="option.suffix" class="text-surface-450 shrink-0 text-[10px]">
            {{ option.suffix }}
          </span>
        </div>
      </div>
    </div>
    <p v-if="props.emptyMessage" class="text-surface-450 px-3 py-6 text-center text-xs">
      {{ props.emptyMessage }}
    </p>
  </div>
</template>
<script setup lang="ts">
  export type AppSearchGroupId = 'tasks' | 'items' | 'hideout';
  export interface AppSearchTarget {
    label: string;
    suffix?: string;
    icon: string;
    to: { path: string; query: Record<string, string> };
  }
  export interface AppSearchOption extends AppSearchTarget {
    index: number;
    domId: string;
  }
  export interface AppSearchGroup {
    id: AppSearchGroupId;
    label: string;
    options: AppSearchOption[];
  }
  const props = defineProps<{
    listboxId: string;
    label: string;
    groups: AppSearchGroup[];
    activeIndex: number;
    emptyMessage?: string;
  }>();
  const emit = defineEmits<{
    hover: [index: number];
    select: [option: AppSearchOption];
  }>();
  // Keyboard navigation keeps the active option inside the scrolled dropdown.
  watch(
    () => props.activeIndex,
    (index) => {
      const option = props.groups.flatMap((group) => group.options)[index];
      if (option) document.getElementById(option.domId)?.scrollIntoView?.({ block: 'nearest' });
    },
    { flush: 'post' }
  );
  const optionClass = (option: AppSearchOption) =>
    option.index === props.activeIndex
      ? 'bg-primary-500/10 text-primary-300'
      : 'text-surface-200 hover:bg-surface-800';
</script>
