<template>
  <div
    :id="ids.card"
    class="flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 transition-colors sm:gap-3"
    :class="rowClasses"
  >
    <!-- The icon, name and progress bar form the level input's native label, so clicking
      anywhere on them focuses the input without a JS handler or button role. The label is
      aria-hidden; the input carries a concise aria-label and its requirement details through
      aria-describedby. Spans keep the label's phrasing content model valid. -->
    <label
      :for="ids.input"
      aria-hidden="true"
      class="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
    >
      <img
        v-if="skill.imageLink"
        :src="skill.imageLink"
        alt=""
        class="h-8 w-8 shrink-0 rounded-sm object-contain"
        loading="lazy"
      />
      <span
        v-else
        class="bg-surface-700 text-surface-400 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-xs"
      >
        ?
      </span>
      <span class="min-w-0 flex-1">
        <span class="flex min-w-0 items-center gap-2">
          <span class="text-surface-100 truncate text-sm font-medium">{{ displayName }}</span>
          <UBadge v-if="isElite" color="warning" variant="soft" size="sm" class="shrink-0">
            {{ $t('settings.skills.elite') }}
          </UBadge>
          <UTooltip v-if="requirement" :text="requirement.details">
            <UBadge
              :color="requirement.color"
              :icon="requirement.icon"
              variant="soft"
              size="sm"
              class="shrink-0"
            >
              {{ requirement.label }}
            </UBadge>
          </UTooltip>
          <span v-if="breakdown" class="text-surface-400 ml-auto shrink-0 text-xs">
            {{ breakdown }}
          </span>
        </span>
        <span class="bg-surface-700 mt-1.5 block h-1 overflow-hidden rounded-full">
          <span
            class="block h-full rounded-full transition-[width] duration-300"
            :class="progressBarClass"
            :style="{ width: progressWidth }"
          />
        </span>
      </span>
    </label>
    <UInput
      :id="ids.input"
      :model-value="level"
      type="text"
      inputmode="decimal"
      :min="0"
      placeholder="0"
      size="sm"
      class="w-20 shrink-0 sm:w-24"
      :ui="{ base: 'tabular-nums' }"
      :aria-label="`${displayName} ${$t('common.level')}`"
      :aria-describedby="describedBy"
      @keydown="(event: KeyboardEvent) => emit('input-keydown', event)"
      @paste="(event: ClipboardEvent) => emit('input-paste', event)"
      @focus="emit('input-focus-change')"
      @blur="emit('input-focus-change')"
      @update:model-value="(value: string | number) => emit('update-level', value)"
    >
      <template #trailing>
        <span class="text-surface-500 text-xs tabular-nums" aria-hidden="true">
          /{{ MAX_SKILL_LEVEL }}
        </span>
      </template>
    </UInput>
    <span :id="ids.range" class="sr-only">{{ $t('settings.skills.valid_range') }}</span>
    <span v-if="requirement" :id="ids.requirement" class="sr-only">
      {{ requirement.details }}
    </span>
    <div class="flex w-8 shrink-0 justify-center empty:hidden sm:empty:flex">
      <UTooltip v-if="offset !== 0" :text="resetLabel">
        <UButton
          icon="i-mdi-restore"
          size="sm"
          variant="ghost"
          color="neutral"
          :aria-label="`${displayName}: ${resetLabel}`"
          @click="emit('reset')"
        />
      </UTooltip>
    </div>
  </div>
</template>
<script setup lang="ts">
  import {
    getSkillCardId,
    getSkillInputId,
    getSkillRangeId,
    getSkillRequirementId,
  } from '@/features/settings/skillsCardIds';
  import { MAX_SKILL_LEVEL } from '@/utils/constants';
  import { formatSkillName, getNextRequiredLevel } from '@/utils/skillHelpers';
  import type { useSkillCalculation } from '@/composables/useSkillCalculation';
  type GameSkill = ReturnType<typeof useSkillCalculation>['allGameSkills']['value'][number];
  const props = defineProps<{
    skill: GameSkill;
    level: number;
    questLevel: number;
    offset: number;
    highlighted?: boolean;
  }>();
  const emit = defineEmits<{
    'update-level': [value: string | number];
    'input-keydown': [event: KeyboardEvent];
    'input-paste': [event: ClipboardEvent];
    'input-focus-change': [];
    reset: [];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const ids = computed(() => ({
    card: getSkillCardId(props.skill.key),
    input: getSkillInputId(props.skill.key),
    range: getSkillRangeId(props.skill.key),
    requirement: getSkillRequirementId(props.skill.key),
  }));
  const displayName = computed(() => formatSkillName(props.skill.name));
  const isElite = computed(() => props.level >= MAX_SKILL_LEVEL);
  const hasRequirements = computed(() => props.skill.requiredLevels.length > 0);
  const nextRequiredLevel = computed(() =>
    getNextRequiredLevel(props.skill.requiredLevels, props.level)
  );
  const requirementDetails = computed(() => {
    const tasks = Array.from(new Set(props.skill.requiredByTasks)).join(', ');
    return [
      t('skills.required_for', { items: tasks }),
      t('skills.required_levels', { items: props.skill.requiredLevels.join(', ') }),
    ].join(' · ');
  });
  const requirement = computed(() => {
    if (!hasRequirements.value) return null;
    const details = requirementDetails.value;
    if (nextRequiredLevel.value === null) {
      return {
        color: 'success' as const,
        icon: 'i-mdi-check',
        label: t('settings.skills.requirement_met'),
        details,
      };
    }
    return {
      color: 'warning' as const,
      icon: 'i-mdi-flag-variant',
      label: t('settings.skills.requirement_needed', { level: nextRequiredLevel.value }),
      details,
    };
  });
  const describedBy = computed(() =>
    requirement.value ? `${ids.value.range} ${ids.value.requirement}` : ids.value.range
  );
  const rowClasses = computed(() =>
    props.highlighted
      ? 'bg-surface-800/40 ring-primary-500 ring-offset-surface-950 border-primary-500/60 ring-2 ring-offset-2'
      : 'border-surface-700 bg-surface-800/40 hover:border-surface-500'
  );
  const progressBarClass = computed(() => {
    if (isElite.value) return 'bg-warning-500';
    if (hasRequirements.value && nextRequiredLevel.value === null) return 'bg-success-500';
    return 'bg-primary-500';
  });
  const progressWidth = computed(() => {
    const clampedLevel = Math.min(Math.max(props.level, 0), MAX_SKILL_LEVEL);
    return `${(clampedLevel / MAX_SKILL_LEVEL) * 100}%`;
  });
  const formatOffset = (offset: number): string => (offset > 0 ? `+${offset}` : String(offset));
  const breakdown = computed(() => {
    if (props.questLevel <= 0) return '';
    const fromQuests = t('settings.skills.from_quests', { level: props.questLevel });
    if (props.offset === 0) return fromQuests;
    const manual = t('settings.skills.manual_adjustment', { offset: formatOffset(props.offset) });
    return `${fromQuests} · ${manual}`;
  });
  const resetLabel = computed(() =>
    t('settings.skills.reset_to_quest', { level: props.questLevel })
  );
</script>
