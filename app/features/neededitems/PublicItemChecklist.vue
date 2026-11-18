<template>
  <details v-if="checklist" class="max-w-3xl text-sm">
    <summary
      class="text-surface-300 hover:text-surface-100 cursor-pointer py-2 underline underline-offset-2"
    >
      {{ t('page.needed_items.pvp_checklist') }}
    </summary>
    <details v-for="category in categories" :key="category" class="border-surface-700 border-b">
      <summary class="text-surface-200 cursor-pointer py-3 text-sm font-medium">
        {{ t(`common.${category}`) }}
      </summary>
      <div
        v-for="group in checklist[category]"
        :key="group.source + (group.level ?? '')"
        class="mb-4"
      >
        <h3 class="text-surface-200 font-medium">
          {{ group.source }}
          <template v-if="group.level != null">
            · {{ t('common.level') }} {{ group.level }}
          </template>
        </h3>
        <ul class="text-surface-300 ml-5 list-disc text-sm">
          <li v-for="(row, index) in group.rows" :key="index" class="py-0.5 wrap-break-word">
            {{ row.count }} × {{ row.name }}
            <span v-if="row.fir">· {{ t('common.found_in_raid_required') }}</span>
            <span v-if="row.optional">· {{ t('common.optional') }}</span>
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
</script>
