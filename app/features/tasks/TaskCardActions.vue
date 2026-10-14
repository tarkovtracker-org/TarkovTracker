<template>
  <div v-if="state !== 'none'" class="ml-2 shrink-0">
    <div v-if="state === 'hotwheels'" class="flex flex-col gap-1">
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
      v-else
      :size="size"
      :color="actionColor"
      variant="soft"
      :class="actionClass"
      @click.stop="emitAction"
    >
      {{ actionLabel }}
    </UButton>
  </div>
</template>
<script setup lang="ts">
  import type { ActionButtonState } from '@/features/tasks/types';
  type TaskAction = 'complete' | 'active' | 'uncomplete' | 'available';
  const ACTIONS_BY_STATE: Record<ActionButtonState, TaskAction | null> = {
    none: null,
    locked: 'available',
    complete: 'uncomplete',
    hotwheels: null,
    active: 'complete',
    available: 'active',
  };
  const ACTION_LABELS: Record<ActionButtonState, { key: string; fallback: string } | null> = {
    none: null,
    locked: { key: 'page.tasks.questcard.available_button', fallback: 'Available' },
    complete: { key: 'page.tasks.questcard.uncomplete_button', fallback: 'Mark Uncompleted' },
    hotwheels: null,
    active: { key: 'common.complete', fallback: 'Complete' },
    available: { key: 'common.accept', fallback: 'Accept' },
  };
  const ACTION_COLORS: Record<ActionButtonState, 'neutral' | 'success' | 'primary'> = {
    none: 'neutral',
    locked: 'neutral',
    complete: 'neutral',
    hotwheels: 'success',
    active: 'success',
    available: 'primary',
  };
  const ACTION_CLASSES: Record<ActionButtonState, string> = {
    none: '',
    locked: '',
    complete: '',
    hotwheels: '',
    active: 'px-3 font-semibold',
    available: 'px-3 font-semibold',
  };
  const props = defineProps<{
    state: ActionButtonState;
    size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    isFailed?: boolean;
  }>();
  const emit = defineEmits<{
    complete: [];
    active: [];
    uncomplete: [];
    available: [];
    failed: [];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const actionLabel = computed(() => {
    if (props.state === 'complete' && props.isFailed) {
      return t('common.reset_failed', 'Reset Failed');
    }
    const label = ACTION_LABELS[props.state];
    return label ? t(label.key, label.fallback) : '';
  });
  const actionColor = computed(() => ACTION_COLORS[props.state]);
  const actionClass = computed(() => ACTION_CLASSES[props.state]);
  const emitAction = () => {
    const action = ACTIONS_BY_STATE[props.state];
    if (action) {
      (emit as unknown as (event: TaskAction) => void)(action);
    }
  };
</script>
