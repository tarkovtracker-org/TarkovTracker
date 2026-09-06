<template>
  <div class="font-ui px-4 py-6 sm:px-6 lg:px-8">
    <div class="mx-auto w-full max-w-7xl space-y-8">
      <header class="space-y-2">
        <h1 class="text-surface-100 text-2xl font-bold sm:text-3xl">
          {{ $t('page.team.page_title') }}
        </h1>
        <p class="text-surface-400 max-w-2xl text-sm leading-6 sm:text-base">
          {{ $t('page.team.page_description') }}
        </p>
      </header>
      <div v-if="route?.query?.team && route?.query?.code">
        <TeamInvite />
      </div>
      <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <MyTeam />
        <TeamOptions />
      </div>
      <TeamMembers v-if="userHasTeam" />
      <TeamDangerZone v-if="userHasTeam" />
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const metaTitle = computed(() => {
    const titleKey = typeof route.meta.titleKey === 'string' ? route.meta.titleKey : 'common.team';
    return t(titleKey);
  });
  const metaDescription = computed(() => t('page.team.meta.description'));
  definePageMeta({
    titleKey: 'common.team',
  });
  useSeoMeta({
    title: metaTitle,
    description: metaDescription,
    robots: 'noindex, nofollow',
  });
  const TeamMembers = defineAsyncComponent(() => import('@/features/team/TeamMembers.vue'));
  const TeamOptions = defineAsyncComponent(() => import('@/features/team/TeamOptions.vue'));
  const MyTeam = defineAsyncComponent(() => import('@/features/team/MyTeam.vue'));
  const TeamInvite = defineAsyncComponent(() => import('@/features/team/TeamInvite.vue'));
  const TeamDangerZone = defineAsyncComponent(() => import('@/features/team/TeamDangerZone.vue'));
  const { hasTeam } = useSystemStoreWithSupabase();
  const userHasTeam = computed(() => hasTeam());
</script>
