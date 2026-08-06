<template>
  <UContainer class="px-4 py-8">
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <UIcon name="i-mdi-archive-arrow-up" class="text-primary-400 h-6 w-6" />
          <h1 class="text-surface-100 text-2xl font-bold">{{ t('page.migrate.title') }}</h1>
        </div>
        <NuxtLink to="/" class="text-surface-400 hover:text-primary-400 transition-colors">
          <UIcon name="i-mdi-arrow-left" class="mr-1 inline h-4 w-4" />
          {{ t('page.migrate.back') }}
        </NuxtLink>
      </header>
      <div
        class="bg-warning-500/10 border-warning-400/20 text-surface-200 flex items-start gap-3 rounded-xl border px-4 py-3 text-base leading-relaxed"
      >
        <UIcon name="i-mdi-alert-circle-outline" class="text-warning-400 mt-0.5 h-5 w-5 shrink-0" />
        <p>
          <span class="text-warning-200 font-semibold">
            {{ t('page.migrate.discontinued_title') }}
          </span>
          {{ t('page.migrate.discontinued_description') }}
        </p>
      </div>
      <section>
        <h2 class="text-primary-300/90 mb-4 text-xs font-semibold tracking-[0.25em] uppercase">
          {{ t('page.migrate.steps_title') }}
        </h2>
        <ol class="space-y-5">
          <li
            v-for="step in steps"
            :key="step.number"
            class="bg-surface-900/60 flex items-start gap-4 rounded-2xl border border-white/10 p-5"
          >
            <span
              class="bg-primary-500/20 text-primary-300 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            >
              {{ step.number }}
            </span>
            <div class="min-w-0 flex-1 space-y-2.5">
              <div>
                <h3 class="text-surface-100 text-base font-semibold sm:text-lg">
                  {{ t(step.titleKey) }}
                </h3>
                <p class="text-surface-300 mt-1 text-sm leading-relaxed sm:text-base">
                  {{ t(step.descriptionKey) }}
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <UButton
                  v-if="step.ctaKey"
                  size="sm"
                  :color="step.primary ? 'primary' : 'neutral'"
                  :variant="step.primary ? 'solid' : 'soft'"
                  :icon="step.icon"
                  :to="step.to"
                  :href="step.href"
                  :target="step.external ? '_blank' : undefined"
                  :rel="step.external ? 'noopener noreferrer' : undefined"
                  trailing-icon="i-mdi-arrow-right"
                >
                  {{ t(step.ctaKey) }}
                </UButton>
                <UButton
                  v-if="step.secondaryCtaKey"
                  size="sm"
                  color="neutral"
                  variant="soft"
                  icon="i-mdi-book-open-variant"
                  :to="step.secondaryTo"
                >
                  {{ t(step.secondaryCtaKey) }}
                </UButton>
              </div>
            </div>
          </li>
        </ol>
      </section>
    </div>
  </UContainer>
</template>
<script setup lang="ts">
  definePageMeta({ layout: 'default' });
  const { t } = useI18n({ useScope: 'global' });
  useSeoMeta({
    title: computed(() => t('page.migrate.title')),
    description: computed(() => t('page.migrate.description')),
    ogTitle: computed(() => t('page.migrate.title')),
    ogDescription: computed(() => t('page.migrate.description')),
  });
  interface MigrateStep {
    number: number;
    titleKey: string;
    descriptionKey: string;
    ctaKey: string;
    icon: string;
    to?: string;
    href?: string;
    external?: boolean;
    primary?: boolean;
    secondaryCtaKey?: string;
    secondaryTo?: string;
  }
  const steps: MigrateStep[] = [
    {
      number: 1,
      titleKey: 'page.migrate.step_1_title',
      descriptionKey: 'page.migrate.step_1_description',
      ctaKey: 'page.migrate.step_1_cta',
      icon: 'i-mdi-account-plus',
      to: '/login',
      primary: true,
    },
    {
      number: 2,
      titleKey: 'page.migrate.step_2_title',
      descriptionKey: 'page.migrate.step_2_description',
      ctaKey: 'page.migrate.step_2_cta',
      icon: 'i-mdi-cog-outline',
      to: '/settings',
    },
    {
      number: 3,
      titleKey: 'page.migrate.step_3_title',
      descriptionKey: 'page.migrate.step_3_description',
      ctaKey: 'page.migrate.step_3_cta',
      icon: 'i-mdi-database-import',
      to: '/settings#imports',
    },
    {
      number: 4,
      titleKey: 'page.migrate.step_4_title',
      descriptionKey: 'page.migrate.step_4_description',
      ctaKey: 'page.migrate.step_4_cta',
      icon: 'i-mdi-clipboard-check-outline',
      to: '/tasks',
    },
    {
      number: 5,
      titleKey: 'page.migrate.step_5_title',
      descriptionKey: 'page.migrate.step_5_description',
      ctaKey: 'page.migrate.step_5_cta',
      icon: 'i-mdi-package-variant',
      to: '/needed-items',
    },
    {
      number: 6,
      titleKey: 'page.migrate.step_6_title',
      descriptionKey: 'page.migrate.step_6_description',
      ctaKey: 'page.migrate.step_6_cta',
      icon: 'i-mdi-eye-outline',
      href: 'https://tarkov.dev/tarkov-monitor',
      external: true,
      primary: true,
      secondaryCtaKey: 'page.migrate.step_6_guide',
      secondaryTo: '/resources/tarkovmonitor',
    },
  ];
</script>
