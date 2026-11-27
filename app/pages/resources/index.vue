<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
    <div class="flex flex-col gap-5">
      <PageHeader :title="t('page.resources.title')" :description="t('page.resources.subtitle')" />
      <div class="space-y-3">
        <label :for="searchInputId" class="sr-only">
          {{ t('page.resources.search_placeholder', 'Search tools and guides...') }}
        </label>
        <UInput
          :id="searchInputId"
          v-model="searchQuery"
          :placeholder="t('page.resources.search_placeholder', 'Search tools and guides...')"
          icon="i-mdi-magnify"
          size="lg"
          class="w-full"
          :ui="{ trailing: 'pe-1' }"
        >
          <template v-if="searchQuery.length" #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              icon="i-mdi-close-circle"
              :aria-label="t('common.clear_search', 'Clear search')"
              @click="searchQuery = ''"
            />
          </template>
        </UInput>
        <div
          class="flex flex-wrap items-center gap-2.5"
          role="group"
          :aria-label="filterGroupLabel"
        >
          <UButton
            v-for="filter in categoryFilters"
            :key="filter.id"
            size="md"
            :color="filter.color"
            :variant="filter.variant"
            :aria-pressed="filter.isActive"
            :class="filter.buttonClass"
            class="max-w-full"
            @click="setActiveCategory(filter.id)"
          >
            <span class="min-w-0 text-left wrap-anywhere whitespace-normal">
              {{ filter.buttonLabel }}
            </span>
          </UButton>
        </div>
        <p v-if="isSearching" class="text-surface-400 text-sm" aria-live="polite">
          {{ resultsCountLabel }}
        </p>
      </div>
      <div v-if="visibleSections.length" class="space-y-8">
        <section v-for="section in visibleSections" :key="section.category" class="space-y-2.5">
          <h2
            v-if="showSectionHeaders"
            class="text-primary-300/90 text-xs font-semibold tracking-[0.25em] uppercase"
          >
            {{ section.label }}
            <span class="text-surface-500 ml-2 tracking-normal normal-case">
              · {{ section.resources.length }}
            </span>
          </h2>
          <div class="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2">
            <ResourceCard
              v-for="resource in section.resources"
              :key="resource.slug"
              :resource="resource"
              :show-category-badge="showCategoryBadges"
            />
          </div>
        </section>
      </div>
      <div
        v-else
        class="bg-surface-900/60 rounded-2xl border border-white/10 px-6 py-10 text-center"
      >
        <UIcon name="i-mdi-magnify-close" class="text-surface-500 mx-auto mb-3 h-10 w-10" />
        <p class="text-surface-300 text-sm sm:text-base">
          {{ t('page.resources.no_results', 'No resources match your search.') }}
        </p>
        <UButton
          class="mt-4"
          size="sm"
          color="neutral"
          variant="soft"
          :label="t('page.resources.clear_filters', 'Clear filters')"
          @click="clearFilters"
        />
      </div>
      <section
        class="bg-surface-900/50 w-full rounded-2xl border border-dashed border-white/10 px-5 py-5 sm:px-6"
      >
        <div class="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 space-y-1">
            <h2 class="light:text-surface-50 text-base font-semibold tracking-wide text-white">
              {{ t('page.resources.suggest_title', 'Know a useful Tarkov resource?') }}
            </h2>
            <p class="text-surface-400 text-sm leading-relaxed sm:text-[0.9375rem]">
              {{
                t(
                  'page.resources.suggest_description',
                  'Suggest a community tool or guide for inclusion on this page.'
                )
              }}
            </p>
          </div>
          <UButton
            href="https://github.com/tarkovtracker-org/TarkovTracker/issues/new?title=Resource%20suggestion%3A%20&labels=enhancement"
            target="_blank"
            rel="noopener noreferrer"
            color="neutral"
            variant="soft"
            icon="i-mdi-lightbulb-on-outline"
            trailing-icon="i-mdi-open-in-new"
            class="min-h-9 w-full shrink-0 justify-center sm:w-auto"
          >
            <span class="text-center sm:truncate">
              {{ t('page.resources.suggest_cta', 'Suggest a resource') }}
            </span>
          </UButton>
        </div>
      </section>
    </div>
  </div>
</template>
<script setup lang="ts">
  import PageHeader from '@/components/ui/PageHeader.vue';
  import ResourceCard from '@/features/resources/ResourceCard.vue';
  import {
    CATEGORY_LABEL_FALLBACKS,
    isResourceCategory,
    matchesResourceSearch,
    RESOURCE_CATEGORIES,
    RESOURCES,
    type Resource,
    type ResourceCategory,
  } from '@/features/resources/resourceData';
  type CategoryFilterId = 'all' | ResourceCategory;
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const router = useRouter();
  definePageMeta({ layout: 'default' });
  const searchInputId = useId();
  const searchQuery = ref('');
  const resolveCategoryFromQuery = (value: unknown): CategoryFilterId => {
    const raw = Array.isArray(value) ? value[0] : value;
    return isResourceCategory(raw) ? raw : 'all';
  };
  // The prerendered hub always contains all categories. Read the URL after hydration.
  const canReadCategory = ref(false);
  onMounted(() => {
    canReadCategory.value = true;
  });
  const activeCategory = computed(() =>
    canReadCategory.value ? resolveCategoryFromQuery(route.query.category) : 'all'
  );
  const setActiveCategory = (category: CategoryFilterId) => {
    const query = { ...route.query };
    if (category === 'all') {
      delete query.category;
    } else {
      query.category = category;
    }
    void router.replace({ query, hash: route.hash });
  };
  const isSearching = computed(() => searchQuery.value.trim().length > 0);
  const filterGroupLabel = computed(() =>
    t('page.resources.filter_label', 'Filter resources by category')
  );
  const toFilterOption = (id: CategoryFilterId, label: string, count: number) => {
    const isActive = activeCategory.value === id;
    return {
      id,
      isActive,
      color: (isActive ? 'primary' : 'neutral') as 'primary' | 'neutral',
      variant: (isActive ? 'solid' : 'soft') as 'solid' | 'soft',
      buttonClass: [
        'min-h-9 px-4',
        isActive
          ? 'ring-primary-400/40 ring-1'
          : 'text-surface-200 light:hover:text-surface-50 hover:text-white',
      ],
      buttonLabel: `${label} (${count})`,
    };
  };
  const categoryFilters = computed(() => [
    toFilterOption('all', t('common.all', 'All'), RESOURCES.length),
    ...RESOURCE_CATEGORIES.map((category) =>
      toFilterOption(
        category,
        t(`page.resources.categories.${category}`, CATEGORY_LABEL_FALLBACKS[category]),
        RESOURCES.filter((resource) => resource.category === category).length
      )
    ),
  ]);
  const getResourceName = (resource: Resource) =>
    t(`page.resources.items.${resource.slug}.name`, resource.slug);
  const getResourceDescription = (resource: Resource) =>
    t(`page.resources.items.${resource.slug}.description`, '');
  const getCategoryLabel = (category: ResourceCategory) =>
    t(`page.resources.categories.${category}`, CATEGORY_LABEL_FALLBACKS[category]);
  const filteredResources = computed(() => {
    const byCategory =
      activeCategory.value === 'all'
        ? RESOURCES
        : RESOURCES.filter((resource) => resource.category === activeCategory.value);
    return byCategory.filter((resource) =>
      matchesResourceSearch(
        resource,
        searchQuery.value,
        getResourceName(resource),
        getResourceDescription(resource),
        getCategoryLabel(resource.category)
      )
    );
  });
  const resultsCountLabel = computed(() =>
    filteredResources.value.length === 1
      ? t('page.resources.results_count_one', '1 resource found')
      : t(
          'page.resources.results_count',
          { count: filteredResources.value.length },
          `${filteredResources.value.length} resources found`
        )
  );
  const showCategoryBadges = computed(() => isSearching.value);
  const showSectionHeaders = computed(() => activeCategory.value === 'all');
  const visibleSections = computed(() => {
    const categories =
      activeCategory.value === 'all' ? RESOURCE_CATEGORIES : [activeCategory.value];
    return categories
      .map((category) => {
        const resources = filteredResources.value
          .filter((resource) => resource.category === category)
          .slice()
          .sort((a, b) => getResourceName(a).localeCompare(getResourceName(b)));
        return {
          category,
          label: getCategoryLabel(category),
          resources,
        };
      })
      .filter((section) => section.resources.length > 0);
  });
  const clearFilters = () => {
    searchQuery.value = '';
    setActiveCategory('all');
  };
</script>
