<template>
  <div class="px-3 py-6 sm:px-6">
    <div class="mx-auto max-w-350 space-y-6">
      <div v-if="route?.query?.team && route?.query?.code" class="mx-auto max-w-6xl">
        <TeamInvite />
      </div>
      <div class="relative mx-auto max-w-6xl">
        <div class="space-y-6">
          <div class="grid gap-4 lg:grid-cols-3">
            <div class="lg:col-span-2">
              <MyTeam />
            </div>
            <TeamOptions />
          </div>
          <TeamMembers v-if="userHasTeam" />
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const metaTitle = computed(() => {
    const titleKey =
      typeof route.meta.titleKey === 'string' ? route.meta.titleKey : 'page.team.meta.title';
    return t(titleKey);
  });
  const metaDescription = computed(() => t('page.team.meta.description'));
  definePageMeta({
    titleKey: 'page.team.meta.title',
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
  const { hasTeam } = useSystemStoreWithSupabase();
  const userHasTeam = computed(() => hasTeam());
</script>
