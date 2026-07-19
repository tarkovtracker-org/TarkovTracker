<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
    <div class="flex flex-col gap-5">
      <header class="mx-auto max-w-2xl space-y-2 text-center">
        <h1 class="text-2xl font-bold tracking-wide text-white sm:text-3xl">
          {{ t('page.resources.title', 'Resources & Guides') }}
        </h1>
        <p class="text-surface-300 text-sm leading-relaxed sm:text-base">
          {{
            t(
              'page.resources.subtitle',
              'Find companion apps, community tools, developer resources, and guides for getting more from TarkovTracker.'
            )
          }}
        </p>
      </header>
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
              :aria-label="t('page.resources.clear_search', 'Clear search')"
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
            :color="activeCategory === filter.id ? 'primary' : 'neutral'"
            :variant="activeCategory === filter.id ? 'solid' : 'soft'"
            :aria-pressed="activeCategory === filter.id"
            :class="[
              'min-h-9 px-4',
              activeCategory === filter.id
                ? 'ring-primary-400/40 ring-1'
                : 'text-surface-200 hover:text-white',
            ]"
            :label="filter.label"
            @click="activeCategory = filter.id"
          />
        </div>
        <p v-if="isSearching" class="text-surface-400 text-sm" aria-live="polite">
          {{
            filteredResources.length === 1
              ? t('page.resources.results_count_one', '1 resource found')
              : t(
                  'page.resources.results_count',
                  { count: filteredResources.length },
                  `${filteredResources.length} resources found`
                )
          }}
        </p>
      </div>
      <div v-if="visibleSections.length" class="space-y-8">
        <section v-for="section in visibleSections" :key="section.category" class="space-y-2.5">
          <h2 class="text-primary-300/90 text-xs font-semibold tracking-[0.25em] uppercase">
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
            <h2 class="text-base font-semibold tracking-wide text-white">
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
            class="min-h-9 shrink-0"
            :label="t('page.resources.suggest_cta', 'Suggest a resource')"
          />
        </div>
      </section>
    </div>
  </div>
</template>
<script setup lang="ts">
  import ResourceCard from '@/features/resources/ResourceCard.vue';
  import {
    CATEGORY_LABEL_FALLBACKS,
    matchesResourceSearch,
    RESOURCE_CATEGORIES,
    RESOURCES,
    type Resource,
    type ResourceCategory,
  } from '@/features/resources/resourceData';
  type CategoryFilterId = 'all' | ResourceCategory;
  const { t } = useI18n({ useScope: 'global' });
  definePageMeta({ layout: 'default' });
  const subtitleFallback =
    'Find companion apps, community tools, developer resources, and guides for getting more from TarkovTracker.';
  useSeoMeta({
    title: computed(() => t('page.resources.title', 'Resources & Guides')),
    description: computed(() => t('page.resources.subtitle', subtitleFallback)),
    ogTitle: computed(() => t('page.resources.title', 'Resources & Guides')),
    ogDescription: computed(() => t('page.resources.subtitle', subtitleFallback)),
  });
  const searchInputId = useId();
  const searchQuery = ref('');
  const activeCategory = ref<CategoryFilterId>('all');
  const isSearching = computed(() => searchQuery.value.trim().length > 0);
  const filterGroupLabel = computed(() =>
    t('page.resources.filter_label', 'Filter resources by category')
  );
  const categoryFilters = computed(() => [
    {
      id: 'all' as const,
      label: t('page.resources.filters.all', 'All'),
    },
    ...RESOURCE_CATEGORIES.map((category) => ({
      id: category,
      label: t(`page.resources.categories.${category}`, CATEGORY_LABEL_FALLBACKS[category]),
    })),
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
  const showCategoryBadges = computed(() => isSearching.value);
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
    activeCategory.value = 'all';
  };
</script>
