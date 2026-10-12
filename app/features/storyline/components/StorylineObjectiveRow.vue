<template>
  <label class="flex items-start gap-2.5" :class="rowClass">
    <input
      :id="inputId"
      :name="inputId"
      type="checkbox"
      :checked="objective.complete"
      class="mt-0.5 size-4 shrink-0"
      :class="ACCENT_CLASSES[accent]"
      :disabled="disabled"
      @change="emit('toggle')"
    />
    <span class="min-w-0 flex-1">
      <span class="flex flex-wrap items-center gap-1.5">
        <UBadge v-if="optional" variant="subtle" color="warning" size="md">
          {{ t('common.optional', 'Optional') }}
        </UBadge>
        <span
          class="text-sm leading-snug wrap-break-word"
          :class="objective.complete ? 'text-surface-500 line-through' : 'text-surface-100'"
        >
          {{ objective.description }}
        </span>
        <UBadge v-if="stateBadge" variant="subtle" :color="stateBadge.color" size="md">
          {{ stateBadge.label }}
        </UBadge>
      </span>
      <span v-if="note" class="mt-1 block text-xs leading-snug" :class="note.class">
        {{ note.text }}
      </span>
      <StorylineUnlockBadges
        v-if="objective.unlocks.length"
        class="mt-1.5"
        :unlocks="objective.unlocks"
        :estimated="objective.hasEstimatedUnlocks"
        :label="t('page.storyline.route_unlocks_here')"
      />
    </span>
  </label>
</template>
<script setup lang="ts">
  import StorylineUnlockBadges from '@/features/storyline/components/StorylineUnlockBadges.vue';
  import type { StorylineObjectiveProgress } from '@/composables/useStorylineChapters';
  type Accent = 'success' | 'warning' | 'info';
  interface Props {
    objective: StorylineObjectiveProgress;
    inputId: string;
    accent?: Accent;
    /** Renders the objective as one boxed option of a "choose one" route decision. */
    choice?: boolean;
    optional?: boolean;
    readOnly?: boolean;
  }
  const props = withDefaults(defineProps<Props>(), { accent: 'success' });
  const emit = defineEmits<{ toggle: [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const ACCENT_CLASSES: Record<Accent, string> = {
    success: 'accent-success-500',
    warning: 'accent-warning-500',
    info: 'accent-info-500',
  };
  const disabled = computed(() => props.readOnly || props.objective.routeState === 'blocked');
  const choiceClass = () => {
    if (props.objective.routeState === 'chosen') return 'border-success-700/40 bg-success-950/20';
    if (disabled.value) return 'border-error-700/30 bg-error-950/10 cursor-not-allowed opacity-70';
    return 'bg-surface-900/40 cursor-pointer border-white/10 hover:bg-white/5';
  };
  const rowClass = computed(() => {
    if (props.choice) return `rounded-md border p-2.5 ${choiceClass()}`;
    const state = disabled.value
      ? 'cursor-not-allowed opacity-65'
      : 'cursor-pointer hover:bg-white/5';
    return `rounded-md px-2 py-1.5 ${state}`;
  });
  const listLabels = (entries: { label: string }[]) =>
    entries.map((entry) => entry.label).join(', ');
  const stateBadge = computed(() => {
    const { routeState, routeAlternatives } = props.objective;
    if (routeState === 'chosen')
      return { color: 'success' as const, label: t('page.storyline.route_chosen') };
    if (routeState === 'blocked')
      return { color: 'error' as const, label: t('common.blocked', 'Blocked') };
    if (!props.choice && routeAlternatives.length) {
      return { color: 'warning' as const, label: t('page.storyline.route_choice') };
    }
    return null;
  });
  const blockingNote = () => {
    const { routeState, routeBlockingAlternatives } = props.objective;
    if (routeState !== 'blocked' || !routeBlockingAlternatives.length) return null;
    const objectives = listLabels(routeBlockingAlternatives);
    return { class: 'text-error-300', text: t('page.storyline.route_blocked_by', { objectives }) };
  };
  const note = computed(() => {
    if (props.choice && props.objective.routeState === 'chosen') {
      return { class: 'text-success-300', text: t('page.storyline.route_selected_hint') };
    }
    const blocking = blockingNote();
    if (blocking || props.choice || !props.objective.routeAlternatives.length) return blocking;
    const objectives = listLabels(props.objective.routeAlternatives);
    return { class: 'text-surface-400', text: t('page.storyline.route_blocks', { objectives }) };
  });
</script>
