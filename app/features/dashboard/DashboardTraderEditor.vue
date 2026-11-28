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
        @input="onReputationInput"
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
  const draftBase = ref<number | null>(null);
  const error = ref<'invalid' | 'minimum' | null>(null);
  const updateFeedback = ref<{ kind: 'updated' } | { kind: 'raised'; value: string } | null>(null);
  const minimumAllowed = computed(
    () =>
      minimumFor(tarkovStore.getCurrentProgressData().traders[props.trader.id]?.level ?? 1) || -10
  );
  function validationMessage(issue: 'invalid' | 'minimum') {
    return issue === 'invalid'
      ? t('page.dashboard.traders.rep_invalid')
      : t('page.dashboard.traders.rep_below_minimum', { value: minimumAllowed.value.toFixed(2) });
  }
  const feedback = computed(() => {
    if (error.value) return validationMessage(error.value);
    const update = updateFeedback.value;
    if (!update) return '';
    return update.kind === 'raised'
      ? t('page.dashboard.traders.rep_raised', { value: update.value })
      : t('page.dashboard.traders.standing_saved');
  });
  watch(reputation, (value) => {
    const formatted = value.toFixed(2);
    if (draftBase.value !== null || draft.value === formatted) return;
    draft.value = formatted;
    clearFeedback();
  });
  function clearFeedback() {
    error.value = null;
    updateFeedback.value = null;
  }
  function onReputationInput() {
    draftBase.value ??= reputation.value;
    clearFeedback();
  }
  function raiseReputationForLevel(required: number) {
    if (!hasReputation.value || required <= 0 || reputation.value >= required) return false;
    tarkovStore.correctTraderReputation(props.trader.id, required);
    return true;
  }
  function updateLevel(event: Event) {
    const next = Number((event.target as HTMLSelectElement).value);
    const required = minimumFor(next);
    clearFeedback();
    const raised = raiseReputationForLevel(required);
    tarkovStore.setTraderLevel(props.trader.id, next);
    draftBase.value = null;
    draft.value = reputation.value.toFixed(2);
    updateFeedback.value = raised
      ? { kind: 'raised', value: required.toFixed(2) }
      : { kind: 'updated' };
  }
  function parseReputation(text: string): number | null {
    const normalized = text.trim().replace(',', '.');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
    const value = Number(normalized);
    if (!Number.isFinite(value)) return null;
    return Number(Math.max(-10, Math.min(Math.max(10, minimum.value), value)).toFixed(2));
  }
  function commitReputation() {
    const base = draftBase.value;
    if (base === null) return;
    draftBase.value = null;
    const value = parseReputation(draft.value);
    if (value === null) {
      error.value = 'invalid';
      return;
    }
    applyReputationEdit(value, base);
  }
  function applyReputationEdit(value: number, base: number) {
    if (value === base || value === reputation.value) {
      draft.value = reputation.value.toFixed(2);
      return;
    }
    if (value < minimumAllowed.value) {
      error.value = 'minimum';
      return;
    }
    tarkovStore.correctTraderReputation(props.trader.id, value);
    draft.value = value.toFixed(2);
    updateFeedback.value = { kind: 'updated' };
  }
</script>
