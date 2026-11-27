<template>
  <div class="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-5 sm:px-6">
    <nav
      class="text-surface-400 flex flex-wrap items-center gap-1.5 text-sm"
      :aria-label="t('page.resources.breadcrumb', 'Breadcrumb')"
    >
      <NuxtLink to="/resources" class="hover:text-primary-300 transition-colors">
        {{ t('page.resources.title', 'Resources & Guides') }}
      </NuxtLink>
      <UIcon name="i-mdi-chevron-right" class="h-4 w-4 shrink-0 opacity-60" />
      <NuxtLink
        :to="{ path: '/resources', query: { category: 'calculators_and_reference' } }"
        class="hover:text-primary-300 transition-colors"
      >
        {{
          t(
            'page.resources.categories.calculators_and_reference',
            CATEGORY_LABEL_FALLBACKS.calculators_and_reference
          )
        }}
      </NuxtLink>
      <UIcon name="i-mdi-chevron-right" class="h-4 w-4 shrink-0 opacity-60" />
      <span class="text-surface-200">{{ t('page.seasonal_modifiers.title') }}</span>
    </nav>
    <PageHeader
      :title="t('page.seasonal_modifiers.title')"
      :description="t('page.seasonal_modifiers.season')"
    >
      <template #actions>
        <UBadge color="warning" variant="soft">
          {{ t('page.seasonal_modifiers.provisional') }}
        </UBadge>
        <UButton
          :href="posterUrl"
          target="_blank"
          rel="noopener noreferrer"
          color="neutral"
          variant="outline"
          trailing-icon="i-mdi-open-in-new"
          :label="t('page.seasonal_modifiers.source')"
        />
      </template>
    </PageHeader>
    <p class="text-warning-200 text-sm">{{ t('page.seasonal_modifiers.notice') }}</p>
    <UAlert
      v-if="!items.length"
      color="neutral"
      variant="soft"
      icon="i-mdi-information-outline"
      :title="
        isLoading
          ? t('page.seasonal_modifiers.catalog_loading')
          : t('page.seasonal_modifiers.catalog_pending')
      "
    />
    <ModifierPlanStatus
      v-else
      :status="planStatus"
      :saving="saving"
      :save-failed="saveFailed"
      @reload="reloadPlan"
      @retry="retrySave"
    >
      <details
        v-if="rules.length"
        class="border-surface-700 bg-surface-900/70 rounded-lg border px-3 py-2 text-sm"
      >
        <summary class="cursor-pointer font-semibold">
          {{ t('page.seasonal_modifiers.global_rules') }}
        </summary>
        <dl class="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="rule in rules" :key="rule.id" class="bg-surface-800/60 rounded-lg p-2.5">
            <dt class="font-semibold">{{ rule.name }}</dt>
            <dd class="text-surface-300 mt-0.5">{{ rule.effect }}</dd>
          </div>
        </dl>
      </details>
      <ModifierBudget
        :spent="spent"
        :earned="earned"
        :net="net"
        :suggestion="suggestion"
        @apply="applySuggestion"
      />
      <p
        v-if="blocked"
        role="alert"
        class="border-error-500/40 bg-error-500/10 text-error-200 rounded-lg border p-2.5 text-sm"
      >
        {{
          t('page.seasonal_modifiers.impossible', {
            name: blocked.name,
            attempted: signed(blocked.attempted),
            minimum: signed(blocked.minimum),
          })
        }}
      </p>
      <div class="grid grid-cols-2 gap-2 lg:flex">
        <UInput
          v-model="query"
          class="col-span-2 w-full min-w-0 lg:w-auto lg:flex-1"
          type="search"
          icon="i-mdi-magnify"
          :aria-label="t('page.seasonal_modifiers.search')"
          :placeholder="t('page.seasonal_modifiers.search')"
        />
        <USelect
          v-model="category"
          class="w-full min-w-0 lg:w-44 lg:shrink-0"
          :items="categoryOptions"
          :aria-label="t('page.seasonal_modifiers.filter_category')"
        />
        <USelect
          v-model="order"
          class="w-full min-w-0 lg:w-48 lg:shrink-0"
          :items="orderOptions"
          :aria-label="t('page.seasonal_modifiers.sort')"
        />
        <UButton
          color="neutral"
          :variant="onlySelected ? 'soft' : 'outline'"
          :aria-pressed="onlySelected"
          :label="t('page.seasonal_modifiers.selected', { count: selected.size })"
          @click="onlySelected = !onlySelected"
        />
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('page.seasonal_modifiers.clear_all')"
          :disabled="!selected.size"
          @click="clear"
        />
      </div>
      <ModifierBoards
        :visible="visible"
        :selected="selected"
        :order="order"
        :floor="floor"
        @toggle="toggle"
      />
    </ModifierPlanStatus>
    <p class="text-surface-400 text-xs">
      {{ t('page.seasonal_modifiers.sign_note') }}
      <ULink
        class="text-primary-300 underline"
        to="https://t.me/escapefromtarkovEN/6656"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('page.seasonal_modifiers.point_rules') }}
      </ULink>
    </p>
  </div>
</template>
<script setup lang="ts">
  import PageHeader from '@/components/ui/PageHeader.vue';
  import { CATEGORY_LABEL_FALLBACKS } from '@/features/resources/resourceData';
  import { useAccountModifierPlanStore } from '@/features/seasonal-modifiers/accountModifierPlan';
  import ModifierBoards from '@/features/seasonal-modifiers/ModifierBoards.vue';
  import ModifierBudget from '@/features/seasonal-modifiers/ModifierBudget.vue';
  import ModifierPlanStatus from '@/features/seasonal-modifiers/ModifierPlanStatus.vue';
  import { modifierCategories, type ModifierOrder } from '@/features/seasonal-modifiers/planner';
  import { previewModifiers, previewRules } from '@/features/seasonal-modifiers/seasonTwo';
  import { useModifierPlanner } from '@/features/seasonal-modifiers/useModifierPlanner';
  import { UNTAR_CONTROL_POSTER_URL as posterUrl } from '@/types/seasonPreview';
  import type { SeasonPreview } from '@/types/seasonPreview';
  const { t, locale } = useI18n({ useScope: 'global' });
  const { $supabase } = useNuxtApp();
  const userId = computed(() => $supabase.user.id ?? null);
  const accountPlan = useAccountModifierPlanStore();
  definePageMeta({ layout: 'default' });
  const query = ref('');
  const category = ref('all');
  const order = ref<ModifierOrder>('category');
  const onlySelected = ref(false);
  const { data: preview, status } = await useLazyFetch<SeasonPreview>(
    '/api/tarkov/season-preview',
    { server: false }
  );
  const items = computed(() => (preview.value ? previewModifiers(preview.value) : []));
  const rules = computed(() => (preview.value ? previewRules(preview.value) : []));
  const isLoading = computed(() => status.value === 'idle' || status.value === 'pending');
  const {
    selected,
    spent,
    earned,
    net,
    floor,
    suggestion,
    blocked,
    status: planStatus,
    saving,
    saveFailed,
    reloadPlan,
    retrySave,
    toggle,
    clear,
    applySuggestion,
  } = useModifierPlanner(items, userId, accountPlan);
  const signed = (value: number) =>
    new Intl.NumberFormat(locale.value, { signDisplay: 'exceptZero' }).format(value);
  const categoryOptions = computed(() => [
    { value: 'all', label: t('page.seasonal_modifiers.all_categories') },
    ...modifierCategories.map((key) => ({
      value: key,
      label: t(`page.seasonal_modifiers.categories.${key}`),
    })),
  ]);
  const orderOptions = computed(() =>
    (['category', 'low', 'high'] as const).map((value) => ({
      value,
      label: t(`page.seasonal_modifiers.order_${value}`),
    }))
  );
  const normalize = (value: string) =>
    value.toLocaleLowerCase(locale.value).replaceAll('**', '').replaceAll('’', "'");
  const matches = computed(() => {
    const term = normalize(query.value.trim());
    return items.value
      .filter((item) => !onlySelected.value || selected.value.has(item.id))
      .filter((item) => category.value === 'all' || item.category === category.value)
      .filter((item) =>
        [item.name, item.effect, t(`page.seasonal_modifiers.categories.${item.category}`)].some(
          (text) => normalize(text).includes(term)
        )
      );
  });
  const visible = computed(() => ({
    drawbacks: matches.value.filter((item) => item.netCost < 0),
    perks: matches.value.filter((item) => item.netCost > 0),
  }));
</script>
