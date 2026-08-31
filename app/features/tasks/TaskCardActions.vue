<template>
  <div v-if="state !== 'none'" class="ml-2 shrink-0">
    <UButton
      v-if="state === 'locked'"
      :size="size"
      color="neutral"
      variant="soft"
      @click.stop="emit('available')"
    >
      {{ t('page.tasks.questcard.available_button') }}
    </UButton>
    <UButton
      v-else-if="state === 'complete'"
      :size="size"
      color="neutral"
      variant="soft"
      @click.stop="emit('uncomplete')"
    >
      {{
        isFailed
          ? t('common.reset_failed', 'Reset Failed')
          : t('page.tasks.questcard.uncomplete_button', 'Mark Uncompleted')
      }}
    </UButton>
    <div v-else-if="state === 'hotwheels' && !isFailed" class="flex flex-col gap-1">
      <UButton
        :size="size"
        color="success"
        variant="soft"
        class="px-3 font-semibold"
        @click.stop="emit('complete')"
      >
        {{ t('common.complete', 'Complete') }}
      </UButton>
      <UButton :size="size" color="error" variant="soft" @click.stop="emit('failed')">
        {{ t('common.fail', 'Fail') }}
      </UButton>
    </div>
    <UButton
      v-else-if="state === 'available' && !isFailed"
      :size="size"
      color="success"
      variant="soft"
      class="px-3 font-semibold"
      @click.stop="emit('complete')"
    >
      {{ t('common.complete', 'Complete') }}
    </UButton>
  </div>
</template>
<script setup lang="ts">
  import type { ActionButtonState } from '@/features/tasks/types';
  defineProps<{
    state: ActionButtonState;
    size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    isFailed?: boolean;
  }>();
  const emit = defineEmits<{
    complete: [];
    uncomplete: [];
    available: [];
    failed: [];
  }>();
  const { t } = useI18n({ useScope: 'global' });
</script>
