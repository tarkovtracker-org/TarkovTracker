<template>
  <UAlert
    v-if="status === 'loading'"
    color="neutral"
    variant="soft"
    role="status"
    :title="t('page.seasonal_modifiers.plan_loading')"
  />
  <UAlert
    v-else-if="status === 'error'"
    color="warning"
    variant="soft"
    role="alert"
    :title="t('page.seasonal_modifiers.plan_load_failed')"
  >
    <template #actions>
      <UButton size="sm" color="warning" variant="soft" @click="emit('reload')">
        {{ t('common.retry') }}
      </UButton>
    </template>
  </UAlert>
  <template v-else>
    <UAlert
      v-if="saveFailed"
      role="alert"
      color="warning"
      variant="soft"
      icon="i-mdi-alert-outline"
      :title="t('page.seasonal_modifiers.save_failed')"
      :description="t('page.seasonal_modifiers.save_failed_description')"
    >
      <template #actions>
        <UButton size="sm" color="warning" variant="soft" :loading="saving" @click="emit('retry')">
          {{ t('common.retry') }}
        </UButton>
      </template>
    </UAlert>
    <p v-else-if="saving" class="text-surface-300 text-sm" role="status">
      {{ t('page.seasonal_modifiers.plan_saving') }}
    </p>
    <slot />
  </template>
</template>
<script setup lang="ts">
  defineProps<{ status: 'loading' | 'ready' | 'error'; saving: boolean; saveFailed: boolean }>();
  const emit = defineEmits<{ reload: []; retry: [] }>();
  const { t } = useI18n({ useScope: 'global' });
</script>
