<template>
  <section class="space-y-4">
    <div class="space-y-1">
      <h3 class="text-surface-100 text-sm font-semibold">{{ $t('setup.traders_title') }}</h3>
      <p class="text-surface-400 text-xs">{{ $t('setup.traders_help') }}</p>
    </div>
    <div class="grid gap-2.5 sm:grid-cols-2">
      <div
        v-for="trader in traders"
        :key="trader.id"
        class="bg-surface-950/55 flex items-center justify-between gap-3 rounded-lg border border-white/8 p-3"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <img
            v-if="trader.imageLink"
            :src="trader.imageLink"
            :alt="trader.name"
            class="bg-surface-800 size-8 shrink-0 rounded-full object-cover"
            loading="lazy"
          />
          <span class="text-surface-100 truncate text-sm font-medium">{{ trader.name }}</span>
        </div>
        <div class="flex shrink-0 items-center gap-1" role="group" :aria-label="trader.name">
          <UButton
            v-for="lvl in trader.levels"
            :key="lvl"
            type="button"
            size="xs"
            :color="trader.currentLevel === lvl ? 'primary' : 'neutral'"
            :variant="trader.currentLevel === lvl ? 'solid' : 'soft'"
            :disabled="saving"
            @click="emit('selectLevel', { id: trader.id, level: lvl })"
          >
            LL{{ lvl }}
          </UButton>
        </div>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
  type TraderItem = {
    id: string;
    name: string;
    imageLink?: string;
    levels: number[];
    currentLevel: number;
  };
  defineProps<{
    traders: readonly TraderItem[];
    saving: boolean;
  }>();
  const emit = defineEmits<{ selectLevel: [selection: { id: string; level: number }] }>();
</script>
