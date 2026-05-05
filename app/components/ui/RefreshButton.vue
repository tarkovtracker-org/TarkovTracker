<template>
  <UButton v-if="refreshEnabled" variant="soft" color="primary" @click="refresh()">
    {{ t('common.refresh_button') }}
  </UButton>
</template>
<script setup lang="ts">
  import { storeToRefs } from 'pinia';
  import { useMetadataStore } from '@/stores/useMetadata';
  const { t } = useI18n({ useScope: 'global' });
  const metadataStore = useMetadataStore();
  const { loading, hideoutLoading } = storeToRefs(metadataStore);
  const router = useRouter();
  const refreshEnabled = ref(false);
  setTimeout(() => {
    if (loading.value || hideoutLoading.value) {
      refreshEnabled.value = true;
    }
  }, 10000);
  const refresh = () => {
    router.go(0);
  };
</script>
