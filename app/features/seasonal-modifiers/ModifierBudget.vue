<template>
  <section
    class="border-primary-500/25 bg-surface-900 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
  >
    <dl class="flex flex-wrap gap-x-5 gap-y-2 sm:gap-x-8">
      <div>
        <dt class="text-surface-300 text-xs">{{ t('page.seasonal_modifiers.spent') }}</dt>
        <dd class="text-lg font-semibold tabular-nums">{{ spent }}</dd>
      </div>
      <div aria-live="polite">
        <dt class="text-surface-300 text-xs">{{ t('page.seasonal_modifiers.net_cost') }}</dt>
        <dd
          class="text-xl font-semibold tabular-nums"
          :class="net > 0 ? 'text-error-300' : 'text-success-300'"
        >
          {{ signed(net) }}
        </dd>
        <dd class="text-surface-300 text-xs">{{ budgetMessage }}</dd>
      </div>
      <div>
        <dt class="text-surface-300 text-xs">{{ t('page.seasonal_modifiers.earned') }}</dt>
        <dd class="text-lg font-semibold tabular-nums">{{ earned }}</dd>
      </div>
    </dl>
    <div v-if="suggestedNames.length" class="flex max-w-full flex-wrap items-center gap-2 text-sm">
      <template v-if="suggestedNames.length <= 2">
        <p>
          {{
            t('page.seasonal_modifiers.suggestion', {
              names: suggestionList.format(suggestedNames),
              total: signed(suggestion.closest),
            })
          }}
        </p>
        <UButton
          size="sm"
          variant="soft"
          :label="t('page.seasonal_modifiers.add_suggestions')"
          @click="emit('apply')"
        />
      </template>
      <details v-else class="min-w-0">
        <summary class="text-primary-200 cursor-pointer">
          {{
            t('page.seasonal_modifiers.review_suggestions', {
              count: suggestedNames.length,
              total: signed(suggestion.closest),
            })
          }}
        </summary>
        <ul class="my-2 max-h-36 list-inside list-disc overflow-y-auto">
          <li v-for="name in suggestedNames" :key="name">{{ name }}</li>
        </ul>
        <UButton
          size="sm"
          variant="soft"
          :label="t('page.seasonal_modifiers.add_suggestions')"
          @click="emit('apply')"
        />
      </details>
    </div>
    <p v-else-if="net !== 0" class="text-surface-300 text-sm">
      {{ t('page.seasonal_modifiers.no_suggestion') }}
    </p>
  </section>
</template>
<script setup lang="ts">
  import type { Modifier } from '@/features/seasonal-modifiers/planner';
  const props = defineProps<{
    spent: number;
    earned: number;
    net: number;
    suggestion: { closest: number; additions: Modifier[] };
  }>();
  const emit = defineEmits<{ apply: [] }>();
  const { t, locale } = useI18n({ useScope: 'global' });
  const signed = (value: number) =>
    new Intl.NumberFormat(locale.value, { signDisplay: 'exceptZero' }).format(value);
  const budgetMessage = computed(() => {
    if (props.net > 0) return t('page.seasonal_modifiers.over_budget', Math.abs(props.net));
    if (props.net < 0) return t('page.seasonal_modifiers.spare', Math.abs(props.net));
    return t('page.seasonal_modifiers.balanced');
  });
  const suggestionList = computed(() => new Intl.ListFormat(locale.value));
  const suggestedNames = computed(() =>
    props.suggestion.additions.map((pick) =>
      t('page.seasonal_modifiers.suggestion_item', {
        name: t(`page.seasonal_modifiers.entries.${pick.id}.name`),
        points: signed(pick.netCost),
      })
    )
  );
</script>
