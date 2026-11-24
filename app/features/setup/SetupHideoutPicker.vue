<template>
  <section class="border-surface-700 space-y-3 rounded-lg border p-4">
    <h3 class="font-semibold">{{ $t('setup.hideout_title') }}</h3>
    <p class="text-surface-400 text-sm">{{ $t('setup.hideout_help') }}</p>
    <div class="grid gap-x-4 gap-y-2 sm:grid-cols-2">
      <UFormField v-for="station in stations" :key="station.id" :label="station.name">
        <USelect
          class="w-full"
          :model-value="levels.get(station.id) ?? station.current"
          :items="station.options"
          :disabled="station.disabled"
          @update:model-value="emit('selectLevel', { id: station.id, level: $event })"
        />
      </UFormField>
    </div>
    <UAlert
      v-if="blockedTiers.length"
      color="warning"
      variant="soft"
      icon="i-mdi-alert-outline"
      :title="$t('setup.hideout_blocked_title')"
    >
      <template #description>
        <p>{{ $t('setup.hideout_blocked_help') }}</p>
        <ul class="mt-2 list-inside list-disc">
          <li v-for="tier in blockedTiers" :key="tier.id">{{ tier.label }}</li>
        </ul>
      </template>
    </UAlert>
  </section>
</template>
<script setup lang="ts">
  type Station = {
    id: string;
    name: string;
    current: number;
    options: { label: string; value: number }[];
    disabled: boolean;
  };
  defineProps<{
    stations: readonly Station[];
    levels: ReadonlyMap<string, number>;
    blockedTiers: readonly { id: string; label: string }[];
  }>();
  const emit = defineEmits<{ selectLevel: [selection: { id: string; level: number }] }>();
</script>
