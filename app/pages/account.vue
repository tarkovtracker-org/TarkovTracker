<template>
  <div class="px-3 py-6 sm:px-6">
    <div class="mx-auto max-w-5xl space-y-4">
      <ProfileSharingCard />
      <PrivacyCard />
      <AccountDeletionCard />
      <div v-if="isAdmin" class="flex justify-center pt-4">
        <NuxtLink
          to="/admin"
          class="hover:text-error-400 text-surface-500 flex items-center gap-1.5 text-xs transition-colors"
        >
          <UIcon name="i-mdi-shield-crown" class="size-3.5" />
          {{ $t('settings.general.admin_panel') }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import AccountDeletionCard from '@/features/settings/AccountDeletionCard.vue';
  import PrivacyCard from '@/features/settings/PrivacyCard.vue';
  import ProfileSharingCard from '@/features/settings/ProfileSharingCard.vue';
  import { useSystemStore, useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  definePageMeta({ middleware: ['auth'] });
  useSeoMeta({
    title: 'Account',
    description:
      'Manage your TarkovTracker account options, sharing visibility, and data controls.',
    robots: 'noindex, nofollow',
  });
  const { hasInitiallyLoaded } = useSystemStoreWithSupabase();
  const systemStore = useSystemStore();
  const isAdmin = computed(() => hasInitiallyLoaded.value && systemStore.isAdmin);
</script>
