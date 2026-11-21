<template>
  <section
    class="border-surface-700 bg-surface-950/45 flex min-w-0 flex-col overflow-hidden rounded-xl border"
    :aria-labelledby="headingId"
  >
    <header class="flex items-center justify-between gap-3 border-b px-4 py-3" :class="headerClass">
      <div>
        <h2 :id="headingId" class="font-semibold">{{ title }}</h2>
        <p class="text-surface-300 text-xs">{{ $t(`page.seasonal_modifiers.${side}_hint`) }}</p>
      </div>
      <UBadge color="neutral" variant="outline">{{ items.length }}</UBadge>
    </header>
    <div
      tabindex="0"
      role="region"
      :aria-labelledby="headingId"
      class="max-h-112 overflow-y-auto overscroll-contain px-2.5 pb-3"
    >
      <p v-if="!items.length" class="text-surface-300 p-4 text-sm">
        {{ $t('page.seasonal_modifiers.empty') }}
      </p>
      <section v-for="group in groups" :key="group.key">
        <h3
          class="bg-surface-950 text-surface-300 sticky top-0 z-10 px-1 pt-2.5 pb-1.5 text-xs font-semibold uppercase"
        >
          {{ group.label }}
        </h3>
        <ModifierCard
          v-for="entry in group.entries"
          :key="entry.id"
          :entry="entry"
          :positive="positive"
          :selected="selected.has(entry.id)"
          :blocked="blocked(entry)"
          @toggle="emit('toggle', entry, $event)"
        />
      </section>
    </div>
  </section>
</template>
<script setup lang="ts">
  import ModifierCard from '@/features/seasonal-modifiers/ModifierCard.vue';
  import {
    groupModifiers,
    type ModifierDisplay,
    type ModifierOrder,
  } from '@/features/seasonal-modifiers/planner';
  const props = defineProps<{
    side: 'drawbacks' | 'perks';
    items: ModifierDisplay[];
    selected: ReadonlySet<string>;
    order: ModifierOrder;
    floor: number;
  }>();
  const emit = defineEmits<{ toggle: [modifier: ModifierDisplay, event: Event] }>();
  const { t } = useI18n({ useScope: 'global' });
  const headingId = useId();
  const positive = computed(() => props.side === 'perks');
  const title = computed(() => t(`page.seasonal_modifiers.${props.side}`));
  const headerClass = computed(() =>
    positive.value
      ? 'border-success-500/30 bg-success-500/15 text-success-200'
      : 'border-error-500/30 bg-error-500/15 text-error-200'
  );
  const blocked = (entry: ModifierDisplay) =>
    positive.value && !props.selected.has(entry.id) && props.floor + entry.netCost > 0;
  const groups = computed(() =>
    groupModifiers(props.items, props.order)
      .filter((group) => group.entries.length)
      .map((group) => ({
        ...group,
        label:
          typeof group.key === 'number'
            ? t(`page.seasonal_modifiers.${props.side}_points`, group.key)
            : t(`page.seasonal_modifiers.categories.${group.key}`),
      }))
  );
</script>
