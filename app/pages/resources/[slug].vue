<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
    <div v-if="!resource || !resource.hasGuide" class="mx-auto max-w-2xl py-16 text-center">
      <UIcon name="i-mdi-alert-circle-outline" class="text-surface-500 mb-3 h-12 w-12" />
      <p class="text-surface-300 text-sm sm:text-base">
        {{
          t(
            'page.resources.guide_not_found',
            'Guide not found. The resource you are looking for may not have a guide yet.'
          )
        }}
      </p>
      <UButton
        to="/resources"
        color="primary"
        variant="soft"
        class="mt-4"
        :label="t('page.resources.back_to_hub', 'Back to Resources')"
        icon="i-mdi-arrow-left"
      />
    </div>
    <div v-else class="space-y-6">
      <ResourceGuideHeader
        :resource="resource"
        :title="guideTitle"
        :description="shortDescription"
        :category-label="categoryLabel"
        :meta-line="metaLine"
        :compatibility-text="compatibilityText"
      />
      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_13rem] lg:gap-8">
        <div class="min-w-0 space-y-10">
          <ResourceGuideArticle
            :resource="resource"
            :guide-title="guideTitle"
            :overview="overviewText"
          />
          <nav
            class="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6"
            :aria-label="t('page.resources.back_to_hub', 'Back to Resources')"
          >
            <UButton
              to="/resources"
              color="neutral"
              variant="soft"
              icon="i-mdi-arrow-left"
              :label="t('page.resources.back_to_hub', 'Back to Resources')"
            />
            <UButton
              :to="{ path: '/resources', query: { category: resource.category } }"
              color="neutral"
              variant="ghost"
              trailing-icon="i-mdi-arrow-right"
              :label="
                t('page.resources.browse_category', { category: categoryLabel }, categoryLabel)
              "
            />
          </nav>
        </div>
        <ResourceGuideToc :items="tocItems" :active-id="activeSectionId" @select="onTocClick" />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import {
    CATEGORY_LABEL_FALLBACKS,
    getResourceBySlug,
    RESOURCE_META_ITEMS,
  } from '@/features/resources/resourceData';
  import ResourceGuideArticle from '@/features/resources/ResourceGuideArticle.vue';
  import ResourceGuideHeader from '@/features/resources/ResourceGuideHeader.vue';
  import ResourceGuideToc, {
    type ResourceGuideTocItem,
  } from '@/features/resources/ResourceGuideToc.vue';
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const slug = computed(() => {
    const param = route.params.slug;
    return (Array.isArray(param) ? param[0] : param) ?? '';
  });
  const resource = computed(() => getResourceBySlug(slug.value));
  if (!resource.value?.hasGuide) {
    throw createError({ statusCode: 404, statusMessage: 'Guide not found' });
  }
  watch(resource, (guide) => {
    if (!guide?.hasGuide) {
      showError(createError({ statusCode: 404, statusMessage: 'Guide not found' }));
    }
  });
  const guideTitle = computed(() => t(`page.resources.items.${slug.value}.name`, slug.value));
  const shortDescription = computed(() => t(`page.resources.items.${slug.value}.description`, ''));
  const overviewText = computed(() =>
    resource.value?.hasGuide
      ? t(`page.resources.guides.${slug.value}.overview`, '')
      : t(
          'page.resources.subtitle',
          'Find companion apps, community tools, developer resources, and guides for getting more from TarkovTracker.'
        )
  );
  const categoryLabel = computed(() => {
    const category = resource.value?.category;
    return category
      ? t(`page.resources.categories.${category}`, CATEGORY_LABEL_FALLBACKS[category])
      : '';
  });
  const metaLine = computed(() => {
    const category = resource.value?.category;
    if (!category) return '';
    return RESOURCE_META_ITEMS[category]
      .map((item) => t(item.labelKey, item.labelFallback))
      .join(' · ');
  });
  const compatibilityText = computed(() =>
    resource.value?.guide?.compatibility
      ? t(`page.resources.guides.${slug.value}.compatibility`, '')
      : ''
  );
  const setupSectionLabel = computed(() => {
    const guide = resource.value?.guide;
    if (guide?.stepsHeadingKey) {
      return t(guide.stepsHeadingKey, guide.stepsHeadingFallback ?? '');
    }
    return t('common.getting_started', 'Getting Started');
  });
  const tocItems = computed<ResourceGuideTocItem[]>(() => {
    const guide = resource.value?.guide;
    const candidates: Array<ResourceGuideTocItem & { enabled: boolean }> = [
      { id: 'overview', label: t('common.overview', 'Overview'), enabled: true },
      {
        id: 'setup',
        label: setupSectionLabel.value,
        enabled: Boolean(guide?.steps),
      },
      {
        id: 'video',
        label: t('page.resources.guide_sections.video_walkthrough', 'Video Walkthrough'),
        enabled: Boolean(resource.value?.videoId),
      },
      {
        id: 'troubleshooting',
        label: t('page.resources.guide_sections.troubleshooting', 'Troubleshooting'),
        enabled: Boolean(guide?.troubleshooting),
      },
      {
        id: 'tips',
        label: t('page.resources.guide_sections.tips', 'Tips & Tricks'),
        enabled: Boolean(guide?.tips),
      },
      {
        id: 'faq',
        label: t('page.resources.guide_sections.faq', 'Common Questions'),
        enabled: Boolean(guide?.faq),
      },
    ];
    return candidates.filter((item) => item.enabled).map(({ id, label }) => ({ id, label }));
  });
  const activeSectionId = ref('overview');
  const SCROLL_OFFSET = 72;
  const onTocClick = (id: string, event: MouseEvent) => {
    event.preventDefault();
    activeSectionId.value = id;
    const target = document.getElementById(id);
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
    window.scrollTo({ top, behavior: 'smooth' });
    history.replaceState(null, '', `#${id}`);
  };
  const getSectionPosition = (item: ResourceGuideTocItem) => {
    const element = document.getElementById(item.id);
    return element ? { id: item.id, top: element.getBoundingClientRect().top } : null;
  };
  const updateActiveSection = () => {
    const sections = tocItems.value.map(getSectionPosition).filter((entry) => entry !== null);
    const current = sections.findLast((section) => section.top <= SCROLL_OFFSET + 8);
    activeSectionId.value = current?.id ?? sections[0]?.id ?? 'overview';
  };
  onMounted(() => {
    updateActiveSection();
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('resize', updateActiveSection);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('scroll', updateActiveSection);
    window.removeEventListener('resize', updateActiveSection);
  });
  watch(tocItems, () => nextTick(updateActiveSection));
  definePageMeta({ layout: 'default' });
</script>
