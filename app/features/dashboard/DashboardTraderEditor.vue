<template>
  <div class="bg-surface-800/70 flex flex-wrap items-end gap-x-4 gap-y-2 rounded-md px-3 py-2.5">
    <label v-if="hasLoyalty" class="text-surface-200 grid gap-1 text-xs">
      {{ $t('page.dashboard.traders.loyalty_level') }}
      <select
        :value="level"
        class="bg-surface-900 border-surface-600 focus-visible:ring-primary-500 min-h-11 rounded-md border px-2 text-base focus-visible:ring-2 focus-visible:outline-none"
        @change="updateLevel"
      >
        <option v-for="option in loyaltyLevels" :key="option" :value="option">
          {{ $t('page.dashboard.traders.loyalty_short', { level: option }) }}
        </option>
      </select>
    </label>
    <label v-if="hasReputation" class="text-surface-200 grid gap-1 text-xs">
      {{ $t(reputationLabelKey) }}
      <input
        v-model="draft"
        type="text"
        inputmode="decimal"
        class="bg-surface-900 border-surface-600 focus-visible:ring-primary-500 aria-invalid:border-error-500 min-h-11 w-22 rounded-md border px-2 text-base tabular-nums focus-visible:ring-2 focus-visible:outline-none"
        :aria-invalid="Boolean(error)"
        :aria-describedby="requirementId"
        @focus="editing = true"
        @input="clearFeedback"
        @blur="commitReputation"
        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
      />
    </label>
    <span
      v-if="hasReputation"
      role="status"
      class="text-surface-300 self-center text-xs"
      :class="{ 'text-error-500': error }"
    >
      {{ feedback }}
    </span>
    <UButton
      class="ms-auto min-h-11"
      color="neutral"
      variant="ghost"
      icon="i-mdi-format-list-checks"
      :to="{ path: '/tasks/traders', query: { trader: trader.id } }"
      :aria-label="$t('page.dashboard.traders.view_tasks', { name: trader.name })"
      @click="preferencesStore.setTaskTraderView(trader.id)"
    >
      {{ $t('page.dashboard.traders.view_tasks_short') }}
    </UButton>
    <p
      v-if="requirement"
      :id="requirementId"
      class="text-surface-300 basis-full text-xs tabular-nums"
    >
      {{ requirement }}
    </p>
  </div>
</template>
<script setup lang="ts">
  import {
    hasTraderLoyalty,
    hasTraderReputation,
    traderReputationMinimum,
  } from '@/features/dashboard/traderStanding';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useTarkovStore } from '@/stores/useTarkov';
  import type { Trader } from '@/types/tarkov';
  const props = defineProps<{ trader: Trader }>();
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const tarkovStore = useTarkovStore();
  const hasLoyalty = computed(() => hasTraderLoyalty(props.trader));
  const hasReputation = computed(() => hasTraderReputation(props.trader));
  const reputationLabelKey = computed(() =>
    hasLoyalty.value ? 'page.dashboard.traders.reputation' : 'page.dashboard.traders.scav_karma'
  );
  const level = computed(() => tarkovStore.getTraderLevel(props.trader.id));
  const reputation = computed(() => tarkovStore.getTraderReputation(props.trader.id) ?? 0);
  const loyaltyLevels = computed(() =>
    props.trader.levels?.length
      ? props.trader.levels.map((entry) => entry.level).toSorted((a, b) => a - b)
      : [1, 2, 3, 4]
  );
  const minimumFor = (option: number) => traderReputationMinimum(props.trader, option);
  const minimum = computed(() => minimumFor(level.value));
  const nextLevel = computed(() =>
    loyaltyLevels.value.find((option) => option > level.value && minimumFor(option) > minimum.value)
  );
  const requirement = computed(() => {
    const hints = [];
    if (minimum.value) {
      hints.push(t('page.dashboard.traders.minimum_rep_hint', { value: minimum.value.toFixed(2) }));
    }
    if (nextLevel.value) {
      hints.push(
        t('page.dashboard.traders.next_rep_requirement', {
          level: nextLevel.value,
          value: minimumFor(nextLevel.value).toFixed(2),
        })
      );
    }
    return hints.join(' · ');
  });
  const requirementId = computed(() =>
    requirement.value ? `dashboard-trader-requirement-${props.trader.id}` : undefined
  );
  const draft = ref(reputation.value.toFixed(2));
  const editing = ref(false);
  const error = ref<'invalid' | 'minimum' | null>(null);
  const saved = ref<'updated' | 'raised' | null>(null);
  const feedback = computed(() => {
    if (error.value === 'invalid') return t('page.dashboard.traders.rep_invalid');
    if (error.value === 'minimum') {
      return t('page.dashboard.traders.rep_below_minimum', { value: minimum.value.toFixed(2) });
    }
    if (saved.value === 'raised') {
      return t('page.dashboard.traders.rep_raised', { value: reputation.value.toFixed(2) });
    }
    return saved.value ? t('page.dashboard.traders.standing_saved') : '';
  });
  watch(reputation, (value) => {
    if (!editing.value) draft.value = value.toFixed(2);
  });
  function clearFeedback() {
    error.value = null;
    saved.value = null;
  }
  function updateLevel(event: Event) {
    const next = Number((event.target as HTMLSelectElement).value);
    const required = minimumFor(next);
    const raiseReputation = hasReputation.value && required > 0 && reputation.value < required;
    clearFeedback();
    if (raiseReputation) tarkovStore.setTraderReputation(props.trader.id, required);
    tarkovStore.setTraderLevel(props.trader.id, next);
    draft.value = reputation.value.toFixed(2);
    saved.value = raiseReputation ? 'raised' : 'updated';
  }
  function parseReputation(text: string): number | null {
    const normalized = text.trim().replace(',', '.');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
    const value = Number(normalized);
    if (!Number.isFinite(value)) return null;
    return Number(Math.max(-10, Math.min(Math.max(10, minimum.value), value)).toFixed(2));
  }
  function commitReputation() {
    editing.value = false;
    if (draft.value === reputation.value.toFixed(2)) return;
    const value = parseReputation(draft.value);
    if (value === null) {
      error.value = 'invalid';
      return;
    }
    if (minimum.value > 0 && value < minimum.value) {
      error.value = 'minimum';
      return;
    }
    tarkovStore.setTraderReputation(props.trader.id, value);
    draft.value = value.toFixed(2);
    saved.value = 'updated';
  }
</script>
