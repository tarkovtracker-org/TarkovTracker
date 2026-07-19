<template>
  <article
    class="bg-surface-900/80 group focus-within:border-primary-400/50 focus-within:ring-primary-400/20 flex h-full min-h-48 flex-col rounded-2xl border border-white/10 p-5 shadow-[0_10px_40px_rgba(0,0,0,0.35)] transition-colors focus-within:ring-1 hover:border-white/20"
  >
    <div class="flex items-start gap-3">
      <div
        v-if="resource.logo"
        class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5"
      >
        <NuxtImg
          :src="resource.logo"
          :alt="name"
          class="h-full w-full object-contain"
          loading="lazy"
        />
      </div>
      <div
        v-else
        class="bg-primary-500/15 text-primary-300 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
      >
        <UIcon name="i-mdi-bookmark" class="h-5 w-5" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <h3 class="text-lg font-semibold tracking-wide text-white">{{ name }}</h3>
          <UBadge
            v-if="showCategoryBadge"
            color="neutral"
            variant="soft"
            size="sm"
            class="shrink-0 uppercase"
          >
            {{ categoryBadge }}
          </UBadge>
        </div>
        <p class="text-surface-300 mt-2 min-h-12 text-[0.9375rem] leading-relaxed">
          {{ description }}
        </p>
      </div>
    </div>
    <div class="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5">
      <UButton
        v-if="primaryAction"
        :to="primaryAction.kind === 'internal' ? primaryAction.href : undefined"
        :href="primaryAction.kind === 'external' ? primaryAction.href : undefined"
        :target="primaryAction.external ? '_blank' : undefined"
        :rel="primaryAction.external ? 'noopener noreferrer' : undefined"
        size="sm"
        color="primary"
        variant="solid"
        class="min-h-9"
        :icon="primaryAction.icon"
        :trailing-icon="primaryAction.external ? 'i-mdi-open-in-new' : undefined"
        :label="t(primaryAction.labelKey, primaryAction.labelFallback)"
      />
      <UButton
        v-if="highlightedSecondary"
        :to="highlightedSecondary.kind === 'internal' ? highlightedSecondary.href : undefined"
        :href="highlightedSecondary.kind === 'external' ? highlightedSecondary.href : undefined"
        :target="highlightedSecondary.external ? '_blank' : undefined"
        :rel="highlightedSecondary.external ? 'noopener noreferrer' : undefined"
        size="sm"
        color="neutral"
        variant="link"
        class="text-surface-200 hover:text-primary-300 min-h-9 px-1"
        :icon="highlightedSecondary.icon"
        :trailing-icon="highlightedSecondary.external ? 'i-mdi-open-in-new' : undefined"
        :label="t(highlightedSecondary.labelKey, highlightedSecondary.labelFallback)"
      />
      <UDropdownMenu
        v-if="moreMenuItems.length"
        :items="moreMenuItems"
        :content="{ align: 'end', sideOffset: 8 }"
      >
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-mdi-dots-horizontal"
          class="text-surface-200 min-h-9 min-w-9 px-3 hover:text-white"
          :aria-label="t('page.resources.more_actions', 'More actions')"
          :label="t('page.resources.more', 'More')"
          trailing-icon="i-mdi-chevron-down"
        />
      </UDropdownMenu>
    </div>
  </article>
</template>
<script setup lang="ts">
  import {
    CATEGORY_BADGE_FALLBACKS,
    getPrimaryAction,
    splitSecondaryActions,
    type Resource,
  } from '@/features/resources/resourceData';
  import type { DropdownMenuItem } from '@nuxt/ui';
  const { t } = useI18n({ useScope: 'global' });
  const props = withDefaults(
    defineProps<{
      resource: Resource;
      showCategoryBadge?: boolean;
    }>(),
    {
      showCategoryBadge: false,
    }
  );
  const name = computed(() =>
    t(`page.resources.items.${props.resource.slug}.name`, props.resource.slug)
  );
  const description = computed(() =>
    t(`page.resources.items.${props.resource.slug}.description`, '')
  );
  const categoryBadge = computed(() =>
    t(
      `page.resources.category_badges.${props.resource.category}`,
      CATEGORY_BADGE_FALLBACKS[props.resource.category]
    )
  );
  const primaryAction = computed(() => getPrimaryAction(props.resource));
  const secondarySplit = computed(() => splitSecondaryActions(props.resource));
  const highlightedSecondary = computed(() => secondarySplit.value.highlighted);
  const moreMenuItems = computed<DropdownMenuItem[][]>(() => {
    const items = secondarySplit.value.more.map((action) => ({
      icon: action.icon,
      label: t(action.labelKey, action.labelFallback),
      to: action.kind === 'internal' ? action.href : undefined,
      href: action.kind === 'external' ? action.href : undefined,
      target: action.external ? ('_blank' as const) : undefined,
      rel: action.external ? 'noopener noreferrer' : undefined,
      trailingIcon: action.external ? 'i-mdi-open-in-new' : undefined,
    }));
    return items.length ? [items] : [];
  });
</script>
