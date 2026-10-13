<template>
  <div data-storyline-objective class="flex flex-col gap-1" :class="rowClass">
    <label class="flex min-w-0 flex-1 items-start gap-2.5" :class="labelClass">
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
          <!-- Wide timelines label the optional lane in their header, so the badge would repeat it. -->
          <UBadge
            v-if="optional"
            variant="subtle"
            color="warning"
            size="md"
            class="@3xl/objectives:hidden"
          >
            {{ t('common.optional', 'Optional') }}
          </UBadge>
          <span
            class="text-sm leading-snug wrap-break-word"
            :class="objective.complete ? 'text-surface-500 line-through' : 'text-surface-100'"
          >
            {{ objective.description }}
          </span>
          <UBadge v-if="stateBadge" variant="subtle" :color="stateBadge.color" size="md">
            {{ t(stateBadge.key, stateBadge.fallback) }}
          </UBadge>
        </span>
        <span v-if="note" class="mt-1 block text-xs leading-snug" :class="note.class">
          {{ note.text }}
        </span>
      </span>
    </label>
    <StorylineUnlockBadges
      v-if="!hideUnlocks && objective.unlocks.length"
      class="pl-6.5"
      :unlocks="objective.unlocks"
      :estimated="objective.hasEstimatedUnlocks"
    />
  </div>
</template>
<script setup lang="ts">
  import StorylineUnlockBadges from '@/features/storyline/components/StorylineUnlockBadges.vue';
  import { isAutomaticStoryObjective } from '@/utils/storylineCompletion';
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
    /** The parent renders the unlock badges itself, e.g. in a timeline's unlocks column. */
    hideUnlocks?: boolean;
  }
  const props = withDefaults(defineProps<Props>(), { accent: 'success' });
  const emit = defineEmits<{ toggle: [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const ACCENT_CLASSES: Record<Accent, string> = {
    success: 'accent-success-500',
    warning: 'accent-warning-500',
    info: 'accent-info-500',
  };
  const disabled = computed(
    () =>
      props.readOnly ||
      isAutomaticStoryObjective(props.objective) ||
      props.objective.routeState === 'blocked'
  );
  const choiceClass = () => {
    if (props.objective.routeState === 'chosen') return 'border-success-700/40 bg-success-950/20';
    if (disabled.value) return 'border-error-700/30 bg-error-950/10 cursor-not-allowed opacity-70';
    return 'bg-surface-900/40 cursor-pointer border-white/10 hover:bg-white/5';
  };
  const rowClass = computed(() => {
    if (props.choice) return `rounded-md border p-2.5 ${choiceClass()}`;
    return `rounded-md px-2 py-1.5 ${disabled.value ? 'opacity-65' : 'hover:bg-white/5'}`;
  });
  const labelClass = computed(() => (disabled.value ? 'cursor-not-allowed' : 'cursor-pointer'));
  const listLabels = (entries: { label: string }[]) =>
    entries.map((entry) => entry.label).join(', ');
  const STATE_BADGES = {
    chosen: { color: 'success', key: 'page.storyline.route_chosen', fallback: 'Route selected' },
    blocked: { color: 'error', key: 'common.blocked', fallback: 'Blocked' },
    open: { color: 'warning', key: 'page.storyline.route_choice', fallback: 'Route choice' },
  } as const;
  // Every completed objective reads as `chosen`, so the badge is reserved for route options; an open
  // option inside a decision box needs no badge because the box already says "Choose one".
  const stateBadge = computed(() => {
    const { routeState, routeAlternatives } = props.objective;
    if (routeState === 'blocked') return STATE_BADGES.blocked;
    if (props.choice) return routeState === 'chosen' ? STATE_BADGES.chosen : null;
    return routeAlternatives.length ? STATE_BADGES[routeState] : null;
  });
  const blockingNote = () => {
    const { routeState, routeBlockingAlternatives } = props.objective;
    if (routeState !== 'blocked' || !routeBlockingAlternatives.length) return null;
    const objectives = listLabels(routeBlockingAlternatives);
    return { class: 'text-error-300', text: t('page.storyline.route_blocked_by', { objectives }) };
  };
  const note = computed(() => {
    if (isAutomaticStoryObjective(props.objective)) {
      return { class: 'text-surface-400', text: t('page.storyline.completed_during_tutorial') };
    }
    if (props.choice && props.objective.routeState === 'chosen') {
      return { class: 'text-success-300', text: t('page.storyline.route_selected_hint') };
    }
    const blocking = blockingNote();
    if (blocking || props.choice || !props.objective.routeAlternatives.length) return blocking;
    const objectives = listLabels(props.objective.routeAlternatives);
    return { class: 'text-surface-400', text: t('page.storyline.route_blocks', { objectives }) };
  });
</script>
