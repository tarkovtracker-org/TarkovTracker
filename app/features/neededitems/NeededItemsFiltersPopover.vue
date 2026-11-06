<template>
  <FiltersPopover
    test-id-prefix="needed-items-filters"
    :title="t('page.needed_items.filters.title')"
    :active-count="activeCount"
    :can-reset="canReset"
    align="start"
    @reset="emit('reset')"
  >
    <FilterSection
      :title="t('page.needed_items.filters.found_in_raid.title')"
      :hint="t('page.needed_items.filters.found_in_raid.hint')"
    >
      <div
        role="group"
        :aria-label="t('page.needed_items.filters.found_in_raid.title')"
        class="bg-surface-900/60 flex items-center gap-1 rounded-lg border border-white/10 p-1"
      >
        <button
          v-for="option in firOptions"
          :key="option.value"
          type="button"
          :data-testid="`needed-items-fir-${option.value}`"
          :aria-pressed="firFilter === option.value"
          class="flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
          :class="
            firFilter === option.value
              ? 'light:bg-surface-700/70 light:text-surface-50 bg-white/10 text-white'
              : 'text-surface-300 light:hover:text-surface-50 hover:text-white'
          "
          @click="firFilter = option.value"
        >
          {{ option.label }}
        </button>
      </div>
    </FilterSection>
    <FilterSection :title="t('page.needed_items.filters.hide.title')">
      <PreferenceSwitch
        v-model="hideOwned"
        test-id="needed-items-filter-hide-owned"
        :label="t('page.needed_items.filters.hide.owned')"
        :description="t('page.needed_items.filters.hide.owned_hint')"
      />
      <PreferenceSwitch
        v-model="hideTeamItems"
        test-id="needed-items-filter-hide-team"
        :label="t('page.needed_items.filters.hide.team')"
        :description="t('page.needed_items.filters.hide.team_hint')"
      />
      <PreferenceSwitch
        v-model="hideNonFirSpecialEquipment"
        test-id="needed-items-filter-hide-special-equipment"
        :label="t('page.needed_items.filters.hide.special_equipment')"
        :description="t('page.needed_items.filters.hide.special_equipment_hint')"
      />
    </FilterSection>
    <FilterSection :title="t('page.needed_items.filters.tasks.title')">
      <PreferenceSwitch
        v-model="kappaOnly"
        test-id="needed-items-filter-kappa-only"
        :label="t('page.needed_items.filters.tasks.kappa_only')"
        :description="
          isKappaDisabled
            ? t('page.needed_items.filters.tasks.kappa_only_disabled')
            : t('page.needed_items.filters.tasks.kappa_only_hint')
        "
        :disabled="isKappaDisabled"
      />
    </FilterSection>
  </FiltersPopover>
</template>
<script setup lang="ts">
  import FilterSection from '@/components/ui/FilterSection.vue';
  import FiltersPopover from '@/components/ui/FiltersPopover.vue';
  import PreferenceSwitch from '@/components/ui/PreferenceSwitch.vue';
  import type { NeededItemsFirFilter } from '@/features/neededitems/neededitems-constants';
  defineProps<{
    activeCount: number;
    /** True while any saved filter is set, including Kappa idle on the Hideout tab. */
    canReset: boolean;
    /** Kappa only narrows task needs, so it has nothing to do on the Hideout tab. */
    isKappaDisabled: boolean;
  }>();
  const emit = defineEmits<{ reset: [] }>();
  const firFilter = defineModel<NeededItemsFirFilter>('firFilter', { required: true });
  const hideOwned = defineModel<boolean>('hideOwned', { required: true });
  const hideTeamItems = defineModel<boolean>('hideTeamItems', { required: true });
  const hideNonFirSpecialEquipment = defineModel<boolean>('hideNonFirSpecialEquipment', {
    required: true,
  });
  const kappaOnly = defineModel<boolean>('kappaOnly', { required: true });
  const { t } = useI18n({ useScope: 'global' });
  const firOptions = computed<Array<{ value: NeededItemsFirFilter; label: string }>>(() => [
    { value: 'all', label: t('common.all') },
    { value: 'fir', label: t('common.fir') },
    { value: 'non-fir', label: t('page.needed_items.filters.found_in_raid.non_fir') },
  ]);
</script>
