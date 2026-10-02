<template>
  <div>
    <PublicPageIntro
      :title="t('seo.routes.home.heading')"
      :description="t('seo.routes.home.description')"
    />
    <nav class="flex flex-wrap gap-x-4 gap-y-2 px-4 pb-4 sm:px-6">
      <NuxtLink to="/tasks" class="text-link underline">{{ t('common.tasks') }}</NuxtLink>
      <NuxtLink to="/hideout" class="text-link underline">{{ t('common.hideout') }}</NuxtLink>
      <NuxtLink to="/needed-items" class="text-link underline">
        {{ t('common.needed_items') }}
      </NuxtLink>
      <NuxtLink to="/kappa" class="text-link underline">{{ t('common.kappa') }}</NuxtLink>
      <NuxtLink to="/storyline" class="text-link underline">{{ t('common.storyline') }}</NuxtLink>
      <NuxtLink to="/resources" class="text-link underline">
        {{ t('page.resources.title') }}
      </NuxtLink>
      <NuxtLink to="/resources/tarkovtracker_org_vs_io" class="text-link underline">
        {{ t('page.resources.items.tarkovtracker_org_vs_io.name') }}
      </NuxtLink>
    </nav>
    <ClientOnly>
      <HomePage />
    </ClientOnly>
  </div>
</template>
<script setup lang="ts">
  import PublicPageIntro from '@/components/PublicPageIntro.vue';
  import HomePage from '@/pages/index.vue';
  const { t } = useI18n({ useScope: 'global' });
</script>
