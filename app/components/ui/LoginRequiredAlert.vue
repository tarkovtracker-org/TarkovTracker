<template>
  <UAlert icon="i-mdi-lock-outline" color="warning" variant="soft" :title="title">
    <template #description>
      <div class="mt-2">
        <UButton icon="i-mdi-login" color="warning" variant="solid" :to="loginUrl">
          {{ t('navigation_drawer.login', 'Log In') }}
        </UButton>
      </div>
    </template>
  </UAlert>
</template>
<script setup lang="ts">
  const props = defineProps<{
    title: string;
    redirectPath?: string;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const loginUrl = computed(() =>
    props.redirectPath ? `/login?redirect=${encodeURIComponent(props.redirectPath)}` : '/login'
  );
</script>
