<template>
  <section
    v-if="showPrompt"
    data-testid="setup-dashboard-prompt"
    class="bg-surface-900 border-primary-500/30 mb-6 flex flex-col gap-3 rounded-xl border p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5"
  >
    <div class="flex min-w-0 items-start gap-3.5">
      <span
        class="bg-primary-500/15 border-primary-500/30 flex size-10 shrink-0 items-center justify-center rounded-xl border"
      >
        <UIcon name="i-mdi-compass-outline" class="text-primary-300 size-5" />
      </span>
      <div class="min-w-0 space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-surface-50 text-sm font-semibold sm:text-base">
            {{ $t(promptTitle) }}
          </h2>
          <UBadge v-if="isResuming" color="primary" variant="subtle" size="xs">
            {{ $t('setup.step_counter', { current: stepIndex + 1, total: visibleSteps.length }) }}
          </UBadge>
        </div>
        <p class="text-surface-300 text-xs leading-5 sm:text-sm">
          {{ $t(promptDescription) }}
        </p>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-2 self-end sm:self-center">
      <UButton to="/setup" color="primary" size="sm" icon="i-mdi-arrow-right" trailing>
        {{ $t(isResuming ? 'setup.resume' : 'setup.dashboard_cta') }}
      </UButton>
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-mdi-close"
        :aria-label="$t('setup.dashboard_dismiss')"
        @click="dismiss"
      />
    </div>
  </section>
</template>
<script setup lang="ts">
  import { hasAnySubstantialProgress } from '@/features/setup/setupProgress';
  import { useSetupCheckpoint } from '@/features/setup/useSetupCheckpoint';
  import { useTarkovStore } from '@/stores/useTarkov';
  const tarkov = useTarkovStore();
  const { step, stepIndex, visibleSteps, isCompleted, dismissed, dismiss } = useSetupCheckpoint();
  const isResuming = computed(() => step.value !== 'start' && !isCompleted.value);
  const promptTitle = computed(() =>
    isResuming.value ? 'setup.dashboard_resume_title' : 'setup.dashboard_welcome_title'
  );
  const promptDescription = computed(() =>
    isResuming.value ? 'setup.dashboard_resume_description' : 'setup.dashboard_welcome_description'
  );
  const showPrompt = computed(() => {
    if (dismissed.value || isCompleted.value) return false;
    return isResuming.value || !hasAnySubstantialProgress(tarkov.$state ?? tarkov);
  });
</script>
