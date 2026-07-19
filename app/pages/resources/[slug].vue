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
      <nav
        class="text-surface-400 flex flex-wrap items-center gap-1.5 text-sm"
        :aria-label="t('page.resources.breadcrumb', 'Breadcrumb')"
      >
        <NuxtLink to="/resources" class="hover:text-primary-300 transition-colors">
          {{ t('page.resources.title', 'Resources & Guides') }}
        </NuxtLink>
        <UIcon name="i-mdi-chevron-right" class="h-4 w-4 shrink-0 opacity-60" />
        <NuxtLink to="/resources" class="hover:text-primary-300 transition-colors">
          {{ categoryLabel }}
        </NuxtLink>
        <UIcon name="i-mdi-chevron-right" class="h-4 w-4 shrink-0 opacity-60" />
        <span class="text-surface-200">{{ guideTitle }}</span>
      </nav>
      <header class="space-y-4">
        <div class="flex items-start gap-4">
          <div
            v-if="resource.logo"
            class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/5"
          >
            <NuxtImg :src="resource.logo" :alt="guideTitle" class="h-full w-full object-contain" />
          </div>
          <div
            v-else
            class="bg-primary-500/15 text-primary-300 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          >
            <UIcon name="i-mdi-bookmark" class="h-6 w-6" />
          </div>
          <div class="min-w-0 flex-1 space-y-2">
            <div>
              <p class="text-primary-300/90 text-xs font-semibold tracking-[0.25em] uppercase">
                {{ t('page.resources.guide_label', 'Guide') }}
              </p>
              <h1 class="mt-1 text-2xl font-bold tracking-wide text-white sm:text-3xl">
                {{ guideTitle }}
              </h1>
            </div>
            <p class="text-surface-200 max-w-3xl text-base leading-relaxed">
              {{ shortDescription }}
            </p>
            <p class="text-surface-400 text-sm">
              {{ metaLine }}
            </p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            v-if="primaryAction"
            :href="primaryAction.href"
            target="_blank"
            rel="noopener noreferrer"
            size="md"
            color="primary"
            variant="solid"
            class="min-h-10"
            :icon="primaryAction.icon"
            trailing-icon="i-mdi-open-in-new"
            :label="t(primaryAction.labelKey, primaryAction.labelFallback)"
          />
          <UButton
            v-for="link in secondaryLinks"
            :key="link.href"
            :href="link.href"
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            color="neutral"
            variant="soft"
            class="min-h-10"
            :icon="link.icon"
            trailing-icon="i-mdi-open-in-new"
            :label="t(link.labelKey, link.labelFallback)"
          />
        </div>
        <div
          v-if="compatibilityText"
          class="bg-warning-500/10 border-warning-400/20 text-surface-200 flex items-start gap-3 rounded-xl border px-4 py-3 text-base leading-relaxed"
        >
          <UIcon
            name="i-mdi-alert-circle-outline"
            class="text-warning-400 mt-0.5 h-5 w-5 shrink-0"
          />
          <p>
            <span class="text-warning-200 font-semibold">
              {{ t('page.resources.compatibility_label', 'Compatibility') }}:
            </span>
            {{ compatibilityText }}
          </p>
        </div>
      </header>
      <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_13rem]">
        <article class="min-w-0 space-y-10">
          <ResourceGuideSection
            id="overview"
            :title="t('page.resources.guide_sections.overview', 'Overview')"
            icon="i-mdi-information-outline"
          >
            <p class="text-surface-200 text-base leading-relaxed">{{ overviewText }}</p>
          </ResourceGuideSection>
          <ResourceGuideSection
            v-if="resource.guide && resource.guide.steps > 0"
            id="setup"
            :title="t('page.resources.guide_sections.setup', 'Getting Started')"
            icon="i-mdi-playlist-check"
          >
            <ol class="space-y-5">
              <li
                v-for="n in resource.guide.steps"
                :key="n"
                class="flex items-start gap-4 border-b border-white/5 pb-5 last:border-0 last:pb-0"
              >
                <span
                  class="bg-primary-500/20 text-primary-300 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                >
                  {{ n }}
                </span>
                <div class="min-w-0 flex-1 space-y-1.5">
                  <h3 class="text-surface-100 text-base font-semibold sm:text-lg">
                    {{ t(`page.resources.guides.${resource.slug}.step_${n}_title`, '') }}
                  </h3>
                  <p class="text-surface-300 text-base leading-relaxed">
                    {{ t(`page.resources.guides.${resource.slug}.step_${n}_desc`, '') }}
                  </p>
                </div>
              </li>
            </ol>
          </ResourceGuideSection>
          <ResourceGuideSection
            v-if="resource.guide && (resource.guide.troubleshooting ?? 0) > 0"
            id="troubleshooting"
            :title="t('page.resources.guide_sections.troubleshooting', 'Troubleshooting')"
            icon="i-mdi-wrench-outline"
          >
            <div class="space-y-4">
              <div
                v-for="n in resource.guide.troubleshooting"
                :key="n"
                class="border-b border-white/5 pb-4 last:border-0 last:pb-0"
              >
                <h3 class="text-surface-100 text-base font-semibold">
                  {{ t(`page.resources.guides.${resource.slug}.troubleshooting_${n}_title`, '') }}
                </h3>
                <p class="text-surface-300 mt-1 text-base leading-relaxed">
                  {{ t(`page.resources.guides.${resource.slug}.troubleshooting_${n}_desc`, '') }}
                </p>
              </div>
            </div>
          </ResourceGuideSection>
          <ResourceGuideSection
            v-if="resource.guide && resource.guide.tips > 0"
            id="tips"
            :title="t('page.resources.guide_sections.tips', 'Tips & Tricks')"
            icon="i-mdi-lightbulb-on-outline"
          >
            <ul class="space-y-3">
              <li
                v-for="n in resource.guide.tips"
                :key="n"
                class="bg-surface-900/40 flex items-start gap-3 rounded-lg border border-white/5 px-3 py-3"
              >
                <UIcon
                  name="i-mdi-lightbulb-outline"
                  class="text-warning-400 mt-0.5 h-4 w-4 shrink-0"
                />
                <span class="text-surface-200 text-base leading-relaxed">
                  {{ t(`page.resources.guides.${resource.slug}.tip_${n}`, '') }}
                </span>
              </li>
            </ul>
          </ResourceGuideSection>
          <ResourceGuideSection
            v-if="resource.guide && resource.guide.faq > 0"
            id="faq"
            :title="t('page.resources.guide_sections.faq', 'Common Questions')"
            icon="i-mdi-help-circle-outline"
          >
            <div class="divide-y divide-white/5 rounded-xl border border-white/10">
              <details v-for="n in resource.guide.faq" :id="`faq-${n}`" :key="n" class="group px-4">
                <summary
                  class="text-surface-100 hover:text-primary-200 focus-visible:ring-primary-400/40 flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-base font-medium transition-colors marker:content-none focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden"
                >
                  <span>{{ t(`page.resources.guides.${resource.slug}.faq_${n}_q`, '') }}</span>
                  <UIcon
                    name="i-mdi-chevron-down"
                    class="text-surface-500 h-5 w-5 shrink-0 transition-transform group-open:rotate-180"
                  />
                </summary>
                <p class="text-surface-300 pb-4 text-base leading-relaxed">
                  {{ t(`page.resources.guides.${resource.slug}.faq_${n}_a`, '') }}
                </p>
              </details>
            </div>
          </ResourceGuideSection>
        </article>
        <aside class="hidden lg:block">
          <div class="sticky top-16 space-y-3">
            <p class="text-surface-400 text-xs font-semibold tracking-[0.2em] uppercase">
              {{ t('page.resources.on_this_page', 'On this page') }}
            </p>
            <nav class="space-y-1" :aria-label="t('page.resources.on_this_page', 'On this page')">
              <a
                v-for="item in tocItems"
                :key="item.id"
                :href="`#${item.id}`"
                :class="[
                  'focus-visible:ring-primary-400/40 block rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
                  activeSectionId === item.id
                    ? 'bg-primary-500/15 text-primary-200'
                    : 'text-surface-300 hover:text-primary-300 hover:bg-white/5',
                ]"
                @click="onTocClick(item.id, $event)"
              >
                {{ item.label }}
              </a>
            </nav>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import {
    CATEGORY_LABEL_FALLBACKS,
    getGuidePrimaryAction,
    getGuideSecondaryLinks,
    getResourceBySlug,
  } from '@/features/resources/resourceData';
  import ResourceGuideSection from '@/features/resources/ResourceGuideSection.vue';
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const slug = computed(() => {
    const param = route.params.slug;
    const value = Array.isArray(param) ? param[0] : param;
    return value ?? '';
  });
  const resource = computed(() => getResourceBySlug(slug.value));
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
    if (!resource.value) return '';
    return t(
      `page.resources.categories.${resource.value.category}`,
      CATEGORY_LABEL_FALLBACKS[resource.value.category]
    );
  });
  const metaLine = computed(() => {
    if (!resource.value) return '';
    const parts: string[] = [];
    if (resource.value.category === 'companion_apps') {
      parts.push(t('page.resources.meta.windows', 'Windows'));
      parts.push(t('page.resources.meta.companion_app', 'Companion App'));
      parts.push(t('page.resources.meta.setup_time', '5-minute setup'));
    } else if (resource.value.category === 'data_and_apis') {
      parts.push(categoryLabel.value);
      parts.push(t('page.resources.meta.community_data', 'Community maintained'));
    } else {
      parts.push(categoryLabel.value);
      parts.push(t('page.resources.meta.web_tool', 'Web tool'));
    }
    return parts.join(' · ');
  });
  const compatibilityText = computed(() => {
    if (!resource.value?.guide?.compatibility) return '';
    return t(`page.resources.guides.${slug.value}.compatibility`, '');
  });
  const primaryAction = computed(() =>
    resource.value ? getGuidePrimaryAction(resource.value) : null
  );
  const secondaryLinks = computed(() =>
    resource.value ? getGuideSecondaryLinks(resource.value) : []
  );
  const tocItems = computed(() => {
    const items = [
      { id: 'overview', label: t('page.resources.guide_sections.overview', 'Overview') },
    ];
    if (resource.value?.guide && resource.value.guide.steps > 0) {
      items.push({
        id: 'setup',
        label: t('page.resources.guide_sections.setup', 'Getting Started'),
      });
    }
    if (resource.value?.guide && (resource.value.guide.troubleshooting ?? 0) > 0) {
      items.push({
        id: 'troubleshooting',
        label: t('page.resources.guide_sections.troubleshooting', 'Troubleshooting'),
      });
    }
    if (resource.value?.guide && resource.value.guide.tips > 0) {
      items.push({
        id: 'tips',
        label: t('page.resources.guide_sections.tips', 'Tips & Tricks'),
      });
    }
    if (resource.value?.guide && resource.value.guide.faq > 0) {
      items.push({
        id: 'faq',
        label: t('page.resources.guide_sections.faq', 'Common Questions'),
      });
    }
    return items;
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
  const updateActiveSection = () => {
    const sections = tocItems.value
      .map((item) => {
        const el = document.getElementById(item.id);
        if (!el) return null;
        return { id: item.id, top: el.getBoundingClientRect().top };
      })
      .filter((entry): entry is { id: string; top: number } => entry !== null);
    if (!sections.length) return;
    const current = [...sections].reverse().find((section) => section.top <= SCROLL_OFFSET + 8);
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
  watch(tocItems, () => {
    nextTick(() => updateActiveSection());
  });
  definePageMeta({ layout: 'default' });
  useSeoMeta({
    title: computed(() =>
      resource.value?.hasGuide
        ? t(
            'page.resources.guide_title_template',
            { name: guideTitle.value },
            `${guideTitle.value} Guide`
          )
        : t('page.resources.title', 'Resources & Guides')
    ),
    description: computed(() => overviewText.value),
  });
</script>
