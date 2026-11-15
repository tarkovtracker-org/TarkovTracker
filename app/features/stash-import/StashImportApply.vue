<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-5">
    <fieldset :disabled="locked">
      <legend class="text-surface-100 mb-2 font-semibold">
        {{ $t('stash_import.mode_title') }}
      </legend>
      <div class="grid gap-2 sm:grid-cols-2">
        <StashImportModeCard
          v-for="option in modeCards"
          :key="option.mode"
          v-bind="option"
          @select="importMode = option.mode"
        />
      </div>
    </fieldset>
    <section class="space-y-2">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="text-surface-100 font-semibold">{{ $t('stash_import.targets') }}</h3>
        <div v-if="targets.length > 1" class="flex gap-1 text-xs">
          <UButton size="xs" variant="link" :disabled="locked" @click="selectAll">
            {{ $t('stash_import.select_all') }}
          </UButton>
          <UButton
            size="xs"
            variant="link"
            color="neutral"
            :disabled="locked"
            @click="selected = []"
          >
            {{ $t('stash_import.select_none') }}
          </UButton>
        </div>
      </div>
      <p v-if="!targets.length" class="bg-surface-850 text-surface-300 rounded-md p-4 text-sm">
        {{ $t('stash_import.no_targets') }}
      </p>
      <ul v-else class="space-y-2">
        <StashImportTargetGroup
          v-for="group in groups"
          :key="group.itemId"
          v-bind="group.view"
          :bitmap="bitmap"
          :locked="locked"
          @toggle="toggle"
        />
      </ul>
      <p v-if="estimate.excess" class="text-surface-400 text-xs">
        {{ $t('stash_import.excess', { count: estimate.excess }) }}
      </p>
      <details v-if="unmatched.length" class="text-surface-400 text-xs">
        <summary class="cursor-pointer">
          {{ $t('stash_import.unmatched', { count: unmatched.length }) }}
        </summary>
        <p class="mt-1">{{ unmatched.map(itemName).join(', ') }}</p>
        <p class="mt-1">{{ $t('stash_import.eligibility_help') }}</p>
      </details>
    </section>
    <label
      v-if="decreases"
      class="border-warning-400/40 bg-warning-500/10 text-warning-200 flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm"
    >
      <input
        v-model="allowDecreases"
        type="checkbox"
        :disabled="locked"
        class="accent-warning-500 mt-0.5 size-4 shrink-0"
      />
      {{ $t('stash_import.confirm_decreases', { count: decreases }) }}
    </label>
  </div>
</template>
<script setup lang="ts">
  import StashImportModeCard from '@/features/stash-import/StashImportModeCard.vue';
  import StashImportTargetGroup from '@/features/stash-import/StashImportTargetGroup.vue';
  import type { TargetRow } from '@/features/stash-import/StashImportTargetRow.vue';
  import type {
    ImportChange,
    ImportEstimate,
    ImportMode,
    ImportTarget,
  } from '@/features/stash-import/useStashImport';
  import type { ObservedTotals } from '@/utils/stashScan/review';
  import type { ScanRect } from '@/utils/stashScan/types';
  const props = defineProps<{
    targets: ImportTarget[];
    totals: ObservedTotals[];
    estimates: Record<ImportMode, ImportEstimate>;
    /** Requirements that would change with everything selected; keeps rows stable on toggle. */
    relevant: Set<string>;
    itemName: (id: string) => string;
    thumbFor: (itemId: string) => ScanRect | undefined;
    bitmap?: ImageBitmap;
    locked: boolean;
  }>();
  const importMode = defineModel<ImportMode>('importMode', { required: true });
  const selected = defineModel<string[]>('selected', { required: true });
  const allowDecreases = defineModel<boolean>('allowDecreases', { required: true });
  const { t } = useI18n({ useScope: 'global' });
  const modes = [
    { mode: 'replace', icon: 'i-mdi-swap-horizontal-bold' },
    { mode: 'add', icon: 'i-mdi-plus-box-multiple-outline' },
  ] as const;
  const lowers = (changes: ImportChange[]) =>
    changes.filter((change) => change.count < change.before).length;
  const estimate = computed(() => props.estimates[importMode.value]);
  const decreases = computed(() => lowers(estimate.value.changes));
  function addImpact(changes: ImportChange[]) {
    const units = changes.reduce((sum, change) => sum + change.count - change.before, 0);
    return t('stash_import.impact_add', { units, count: changes.length });
  }
  function replaceImpact(changes: ImportChange[]) {
    const lower = lowers(changes);
    return lower
      ? t('stash_import.impact_replace_lower', { count: changes.length, lower })
      : t('stash_import.impact_replace', { count: changes.length });
  }
  function impact(mode: ImportMode) {
    const changes = props.estimates[mode].changes;
    if (!changes.length) return t('stash_import.impact_none');
    return mode === 'add' ? addImpact(changes) : replaceImpact(changes);
  }
  function impactTone(mode: ImportMode) {
    const changes = props.estimates[mode].changes;
    if (!changes.length) return 'text-surface-500';
    return lowers(changes) ? 'text-warning-300' : 'text-success-300';
  }
  const modeCards = computed(() =>
    modes.map((option) => ({
      ...option,
      selected: importMode.value === option.mode,
      impact: impact(option.mode),
      impactTone: impactTone(option.mode),
    }))
  );
  const changeKey = (target: ImportTarget) =>
    `${target.need.needType === 'taskObjective' ? 'task' : 'hideout'}:${target.need.id}`;
  const changesByKey = computed(
    () => new Map(estimate.value.changes.map((change) => [`${change.type}:${change.id}`, change]))
  );
  function rowFor(target: ImportTarget): TargetRow {
    const after = changesByKey.value.get(changeKey(target))?.count ?? target.current;
    return {
      target,
      isTask: target.need.needType === 'taskObjective',
      selected: selected.value.includes(target.key),
      before: target.current,
      after,
      delta: after - target.current,
      relevant: props.relevant.has(changeKey(target)),
    };
  }
  const byRelevance = (a: TargetRow, b: TargetRow) => Number(b.relevant) - Number(a.relevant);
  function foundLabel(total: ObservedTotals) {
    const parts = [
      total.fir && t('stash_import.found_fir', { count: total.fir }),
      total.nonFir && t('stash_import.found_non_fir', { count: total.nonFir }),
      total.unknown && t('stash_import.found_unknown', { count: total.unknown }),
    ].filter(Boolean);
    return `${t('stash_import.found_label')} ${parts.join(' · ')}`;
  }
  const groups = computed(() =>
    props.totals.flatMap((total) => {
      const rows = props.targets
        .filter((target) => target.itemId === total.itemId)
        .map(rowFor)
        .sort(byRelevance);
      if (!rows.length) return [];
      return [
        {
          itemId: total.itemId,
          view: {
            name: props.itemName(total.itemId),
            found: foundLabel(total),
            thumb: props.thumbFor(total.itemId),
            rows,
          },
        },
      ];
    })
  );
  const unmatched = computed(() =>
    props.totals
      .map((total) => total.itemId)
      .filter((id) => !props.targets.some((target) => target.itemId === id))
  );
  function selectAll() {
    selected.value = props.targets.map((target) => target.key);
  }
  function toggle(key: string) {
    selected.value = selected.value.includes(key)
      ? selected.value.filter((entry) => entry !== key)
      : [...selected.value, key];
  }
</script>
