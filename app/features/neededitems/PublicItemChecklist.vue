<template>
  <details v-if="checklist" class="mb-2 max-w-3xl text-sm">
    <summary
      class="text-surface-300 hover:text-surface-100 cursor-pointer py-2 underline underline-offset-2"
    >
      {{ t('page.needed_items.pvp_checklist') }}
    </summary>
    <details v-for="category in categories" :key="category" class="border-surface-700 border-b">
      <summary class="text-surface-200 cursor-pointer py-3 text-sm font-medium">
        {{ t(`common.${category}`) }}
      </summary>
      <div v-for="group in checklist[category]" :key="group.id" class="mb-4">
        <h2 class="text-surface-200 font-medium">{{ groupHeading(group) }}</h2>
        <ul class="text-surface-300 ml-5 list-disc text-sm">
          <li v-for="(row, index) in group.rows" :key="index" class="py-0.5 wrap-break-word">
            {{ rowLabel(row) }}
          </li>
        </ul>
      </div>
    </details>
  </details>
</template>
<script setup lang="ts">
  const { t } = useI18n({ useScope: 'global' });
  const categories = ['tasks', 'hideout'] as const;
  prerenderRoutes('/data/needed-items-pvp.json');
  const { data: checklist, error } = await useLazyFetch('/data/needed-items-pvp.json');
  if (import.meta.prerender && error.value) throw createError(error.value);
  type ChecklistGroup = NonNullable<typeof checklist.value>['tasks'][number];
  const groupHeading = (group: ChecklistGroup) => {
    if (group.level != null) return `${group.source} · ${t('common.level')} ${group.level}`;
    if (group.prestige) return `${group.source} · ${t('common.prestige')} ${group.prestige}`;
    return [group.source, group.faction].filter(Boolean).join(' · ');
  };
  const rowLabel = (row: ChecklistGroup['rows'][number]) =>
    [
      `${row.count} × ${row.name}`,
      row.fir && t('common.found_in_raid_required'),
      row.optional && t('common.optional'),
    ]
      .filter(Boolean)
      .join(' · ');
</script>
