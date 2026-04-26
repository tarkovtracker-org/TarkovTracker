<template>
  <GenericCard
    icon="i-mdi-api"
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
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import ApiTokens from '@/features/settings/ApiTokens.vue';
  const { $supabase } = useNuxtApp();
  const isLoggedIn = computed(() => Boolean($supabase?.user?.loggedIn));
</script>
