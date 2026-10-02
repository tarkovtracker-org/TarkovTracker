<template>
  <div class="font-ui px-4 py-6 sm:px-6 lg:px-8">
    <div class="mx-auto w-full max-w-7xl space-y-8">
      <PageHeader :title="t('common.team')" :description="t('page.team.page_description')" />
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
  import PageHeader from '@/components/ui/PageHeader.vue';
  import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  definePageMeta({
    titleKey: 'common.team',
  });
  const TeamMembers = defineAsyncComponent(() => import('@/features/team/TeamMembers.vue'));
  const TeamOptions = defineAsyncComponent(() => import('@/features/team/TeamOptions.vue'));
  const MyTeam = defineAsyncComponent(() => import('@/features/team/MyTeam.vue'));
  const TeamInvite = defineAsyncComponent(() => import('@/features/team/TeamInvite.vue'));
  const TeamDangerZone = defineAsyncComponent(() => import('@/features/team/TeamDangerZone.vue'));
  const { hasTeam } = useSystemStoreWithSupabase();
  const userHasTeam = computed(() => hasTeam());
</script>
