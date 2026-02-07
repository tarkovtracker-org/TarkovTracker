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
          ? t('page.tasks.questcard.reset_failed')
          : t('page.tasks.questcard.uncomplete_button')
      }}
    </UButton>
    <div v-else-if="state === 'hotwheels'" class="flex flex-col gap-1">
      <UButton
        :size="size"
        color="success"
        variant="soft"
        class="px-3 font-semibold"
        @click.stop="emit('complete')"
      >
        {{ t('page.tasks.questcard.complete_button') }}
      </UButton>
      <UButton :size="size" color="error" variant="soft" @click.stop="emit('failed')">
        {{ t('page.tasks.questcard.fail_button') }}
      </UButton>
    </div>
    <UButton
      v-else-if="state === 'available'"
      :size="size"
      color="success"
      variant="soft"
      class="px-3 font-semibold"
      @click.stop="emit('complete')"
    >
      {{ t('page.tasks.questcard.complete_button') }}
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
