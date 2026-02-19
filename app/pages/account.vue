<template>
  <div class="px-3 py-6 sm:px-6">
    <div class="mx-auto max-w-5xl space-y-4">
      <ProfileSharingCard />
      <PrivacyCard />
      <GenericCard
        icon="mdi-key-chain"
        icon-color="secondary"
        highlight-color="secondary"
        :fill-height="false"
        :title="$t('page.settings.card.apitokens.title')"
        title-classes="text-lg font-semibold"
      >
        <template #content>
          <div class="relative px-4 py-4">
            <ApiTokens v-if="isLoggedIn" />
            <UAlert
              v-else
              color="warning"
              variant="soft"
              icon="i-mdi-lock"
              :title="$t('page.settings.card.apitokens.not_logged_in')"
            />
          </div>
        </template>
      </GenericCard>
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
  import GenericCard from '@/components/ui/GenericCard.vue';
  import AccountDeletionCard from '@/features/settings/AccountDeletionCard.vue';
  import ApiTokens from '@/features/settings/ApiTokens.vue';
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
  const { $supabase } = useNuxtApp();
  const { hasInitiallyLoaded } = useSystemStoreWithSupabase();
  const isLoggedIn = computed(() => Boolean($supabase?.user?.loggedIn));
  const systemStore = useSystemStore();
  const isAdmin = computed(() => hasInitiallyLoaded.value && systemStore.isAdmin);
</script>
