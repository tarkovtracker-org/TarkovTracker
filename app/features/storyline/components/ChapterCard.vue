<template>
  <div
    class="bg-surface-900 rounded-lg border border-white/10 p-4 transition-colors"
    :class="chapter.complete ? 'border-success-700/30' : ''"
  >
    <div class="mb-3 flex items-center gap-3">
      <button
        v-if="canToggleChapter"
        type="button"
        class="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center"
        :aria-label="
          chapter.complete ? t('page.storyline.mark_incomplete') : t('page.storyline.mark_complete')
        "
        @click="emit('toggleChapter', chapter.id)"
      >
        <img
          :src="`/img/storyline/${chapter.normalizedName}.webp`"
          :alt="chapter.name"
          class="h-10 w-10 object-contain"
          :class="chapter.complete ? '' : 'opacity-40'"
        />
        <UIcon
          v-if="chapter.complete"
          name="i-mdi-check-bold"
          class="bg-success-600/80 absolute right-0 bottom-0 h-3.5 w-3.5 rounded-tl p-0.5 text-white"
        />
      </button>
      <div v-else class="relative flex h-10 w-10 shrink-0 items-center justify-center">
        <img
          :src="`/img/storyline/${chapter.normalizedName}.webp`"
          :alt="chapter.name"
          class="h-10 w-10 object-contain"
          :class="chapter.complete ? '' : 'opacity-40'"
        />
        <UIcon
          v-if="chapter.complete"
          name="i-mdi-check-bold"
          class="bg-success-600/80 absolute right-0 bottom-0 h-3.5 w-3.5 rounded-tl p-0.5 text-white"
        />
      </div>
      <div class="min-w-0 flex-1">
        <a
          :href="toWikiUrl(chapter.wikiLink)"
          target="_blank"
          rel="noopener noreferrer"
          class="text-link hover:text-link-hover flex items-center gap-1 text-sm font-semibold no-underline"
        >
          <span class="truncate">{{ chapter.name }}</span>
          <UIcon
            name="i-mdi-open-in-new"
            class="text-surface-400 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
        </a>
        <div class="flex items-center gap-1.5">
          <UBadge v-if="chapter.autoStart" variant="subtle" color="info" size="xs">
            {{ t('page.profile.storyline_auto_start') }}
          </UBadge>
          <UBadge v-else variant="subtle" color="neutral" size="xs">
            {{ t('page.profile.storyline_discovered') }}
          </UBadge>
        </div>
      </div>
    </div>
    <div
      v-if="chapter.requirements.length"
      class="bg-surface-950/20 mb-2 rounded-md border border-white/5 p-2"
    >
      <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
        {{ t('page.profile.storyline_requires') }}
      </div>
      <ul class="space-y-0.5">
        <li
          v-for="requirement in chapter.requirements"
          :key="requirement.id"
          class="text-surface-300 text-xs"
        >
          {{ requirement.label }}
        </li>
      </ul>
    </div>
    <div
      v-if="chapter.endings.length"
      class="bg-primary-950/10 border-primary-700/30 mb-2 rounded-md border p-2"
    >
      <div class="mb-1 flex items-center justify-between gap-2">
        <div class="text-primary-300 text-[11px] font-medium tracking-wider uppercase">
          {{ t('page.storyline.endings') }}
        </div>
        <UBadge variant="subtle" color="primary" size="xs">
          {{ chapter.endings.length }}
        </UBadge>
      </div>
      <div class="space-y-1">
        <div
          v-for="ending in chapter.endings"
          :key="ending.id"
          class="rounded border p-2"
          :class="getEndingCardClass(ending.routeState)"
        >
          <div class="flex flex-wrap items-center gap-1">
            <span class="text-xs font-semibold text-white">{{ ending.label }}</span>
            <UBadge
              v-if="ending.routeChoiceIndex !== null"
              variant="subtle"
              color="warning"
              size="xs"
            >
              {{ t('page.storyline.route_decision', { index: ending.routeChoiceIndex }) }}
            </UBadge>
            <UBadge variant="subtle" :color="getEndingBadgeColor(ending.routeState)" size="xs">
              {{ getEndingBadgeLabel(ending.routeState) }}
            </UBadge>
          </div>
          <div
            v-if="ending.objectiveLabel && ending.objectiveLabel !== ending.label"
            class="text-surface-400 mt-0.5 text-[11px] leading-tight"
          >
            {{ ending.objectiveLabel }}
          </div>
          <div
            v-if="ending.routeState === 'blocked' && ending.routeBlockingAlternatives.length"
            class="text-error-300 mt-0.5 text-[11px] leading-tight"
          >
            {{
              t('page.storyline.route_blocked_by', {
                objectives: ending.routeBlockingAlternatives.map((entry) => entry.label).join(', '),
              })
            }}
          </div>
        </div>
      </div>
    </div>
    <div
      v-if="chapter.mainObjectives.length || chapter.optionalObjectives.length"
      class="bg-surface-950/20 mb-2 rounded-md border border-white/5 p-2"
    >
      <div v-if="chapter.mainObjectives.length">
        <div
          class="text-surface-500 mb-0.5 flex items-center justify-between text-[11px] font-medium tracking-wider uppercase"
        >
          <span>{{ t('page.profile.storyline_objectives_main') }}</span>
          <span>{{ chapter.mainObjectiveCompleted }}/{{ chapter.mainObjectiveTotal }}</span>
        </div>
        <div v-if="chapter.mainRouteChoices.length" class="mb-1.5 space-y-1.5">
          <div
            v-for="(routeChoice, routeIndex) in chapter.mainRouteChoices"
            :key="routeChoice.id"
            class="border-warning-700/30 bg-warning-950/10 rounded-md border p-2"
          >
            <div class="mb-1 flex items-center justify-between gap-2">
              <div class="text-warning-300 text-[11px] font-medium tracking-wider uppercase">
                {{ t('page.storyline.route_decision', { index: routeIndex + 1 }) }}
              </div>
              <UBadge variant="subtle" color="warning" size="xs">
                {{ t('page.storyline.route_choose_one') }}
              </UBadge>
            </div>
            <div class="grid grid-cols-1 gap-1">
              <label
                v-for="objective in routeChoice.objectives"
                :key="objective.id"
                class="flex items-start gap-1.5 rounded border p-2"
                :class="
                  objective.routeState === 'chosen'
                    ? 'border-success-700/40 bg-success-950/20'
                    : props.readOnly || objective.routeState === 'blocked'
                      ? 'border-error-700/30 bg-error-950/10 cursor-not-allowed opacity-70'
                      : 'bg-surface-900/40 cursor-pointer border-white/10 hover:bg-white/5'
                "
              >
                <input
                  :id="getObjectiveInputId(chapter.id, objective.id)"
                  :name="getObjectiveInputId(chapter.id, objective.id)"
                  type="checkbox"
                  :checked="objective.complete"
                  class="accent-success-500 mt-0.5 shrink-0"
                  :disabled="props.readOnly || objective.routeState === 'blocked'"
                  @change="emit('toggleObjective', chapter.id, objective.id)"
                />
                <span class="min-w-0 flex-1">
                  <span class="flex flex-wrap items-center gap-1">
                    <span
                      class="text-xs"
                      :class="
                        objective.complete ? 'text-surface-500 line-through' : 'text-surface-200'
                      "
                    >
                      {{ objective.description }}
                    </span>
                    <UBadge
                      v-if="objective.routeState === 'chosen'"
                      variant="subtle"
                      color="success"
                      size="xs"
                    >
                      {{ t('page.storyline.route_chosen') }}
                    </UBadge>
                    <UBadge
                      v-else-if="objective.routeState === 'blocked'"
                      variant="subtle"
                      color="error"
                      size="xs"
                    >
                      {{ t('page.storyline.route_blocked') }}
                    </UBadge>
                  </span>
                  <span
                    v-if="objective.routeState === 'chosen'"
                    class="text-success-300 mt-0.5 block text-[11px] leading-tight"
                  >
                    {{ t('page.storyline.route_selected_hint') }}
                  </span>
                  <span
                    v-else-if="
                      objective.routeState === 'blocked' &&
                      objective.routeBlockingAlternatives.length
                    "
                    class="text-error-300 mt-0.5 block text-[11px] leading-tight"
                  >
                    {{
                      t('page.storyline.route_blocked_by', {
                        objectives: objective.routeBlockingAlternatives
                          .map((entry) => entry.label)
                          .join(', '),
                      })
                    }}
                  </span>
                  <span
                    v-if="objective.unlocks.length"
                    class="mt-0.5 flex flex-wrap items-center gap-1"
                  >
                    <span class="text-surface-500 text-[11px] font-medium uppercase">
                      {{ t('page.storyline.route_unlocks_here') }}:
                    </span>
                    <UBadge
                      v-for="unlock in objective.unlocks"
                      :key="`${objective.id}-${unlock.type}-${unlock.id}`"
                      variant="subtle"
                      size="xs"
                      :color="getUnlockBadgeColor(unlock.type)"
                    >
                      {{ getUnlockLabel(unlock.type, unlock.label) }}
                    </UBadge>
                    <UBadge
                      v-if="objective.hasEstimatedUnlocks"
                      variant="subtle"
                      color="neutral"
                      size="xs"
                    >
                      {{ t('page.storyline.route_unlocks_estimated') }}
                    </UBadge>
                  </span>
                </span>
              </label>
            </div>
            <div
              v-if="routeChoice.chosenObjectiveId"
              class="text-warning-200 mt-1 text-[11px] leading-tight"
            >
              {{ t('page.storyline.route_switch_hint') }}
            </div>
          </div>
        </div>
        <div v-if="getInterleavedTimelineObjectives(chapter).length" class="mb-1">
          <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
            {{ t('page.storyline.route_required_steps') }}
          </div>
        </div>
        <div class="space-y-0.5">
          <div
            v-for="objective in getInterleavedTimelineObjectives(chapter)"
            :key="objective.id"
            :class="objective.type === 'optional' ? 'ml-3 border-l border-white/5 pl-2' : ''"
          >
            <label
              class="flex items-start gap-1.5 rounded px-1 py-0.5"
              :class="
                props.readOnly || objective.routeState === 'blocked'
                  ? 'cursor-not-allowed opacity-65'
                  : 'cursor-pointer hover:bg-white/5'
              "
            >
              <input
                :id="getObjectiveInputId(chapter.id, objective.id)"
                :name="getObjectiveInputId(chapter.id, objective.id)"
                type="checkbox"
                :checked="objective.complete"
                class="mt-0.5 shrink-0"
                :class="objective.type === 'optional' ? 'accent-warning-500' : 'accent-success-500'"
                :disabled="props.readOnly || objective.routeState === 'blocked'"
                @change="emit('toggleObjective', chapter.id, objective.id)"
              />
              <span class="min-w-0 flex-1">
                <span class="flex flex-wrap items-center gap-1">
                  <UBadge
                    v-if="objective.type === 'optional'"
                    variant="subtle"
                    color="warning"
                    size="xs"
                  >
                    {{ t('page.storyline.route_optional') }}
                  </UBadge>
                  <span
                    class="text-xs"
                    :class="
                      objective.complete
                        ? objective.type === 'optional'
                          ? 'text-surface-500 min-w-0 flex-1 wrap-break-word line-through'
                          : 'text-surface-500 line-through'
                        : objective.type === 'optional'
                          ? 'text-surface-300 min-w-0 flex-1 wrap-break-word'
                          : 'text-surface-300'
                    "
                  >
                    {{ objective.description }}
                  </span>
                  <UBadge
                    v-if="objective.routeState === 'chosen'"
                    variant="subtle"
                    color="success"
                    size="xs"
                  >
                    {{ t('page.storyline.route_chosen') }}
                  </UBadge>
                  <UBadge
                    v-else-if="objective.routeState === 'blocked'"
                    variant="subtle"
                    color="error"
                    size="xs"
                  >
                    {{ t('page.storyline.route_blocked') }}
                  </UBadge>
                  <UBadge
                    v-else-if="objective.routeAlternatives.length"
                    variant="subtle"
                    color="warning"
                    size="xs"
                  >
                    {{ t('page.storyline.route_choice') }}
                  </UBadge>
                </span>
                <span
                  v-if="
                    objective.routeState === 'blocked' && objective.routeBlockingAlternatives.length
                  "
                  class="text-error-300 mt-0.5 block text-[11px] leading-tight"
                >
                  {{
                    t('page.storyline.route_blocked_by', {
                      objectives: objective.routeBlockingAlternatives
                        .map((entry) => entry.label)
                        .join(', '),
                    })
                  }}
                </span>
                <span
                  v-else-if="objective.routeAlternatives.length"
                  class="text-surface-500 mt-0.5 block text-[11px] leading-tight"
                >
                  {{
                    t('page.storyline.route_blocks', {
                      objectives: objective.routeAlternatives
                        .map((entry) => entry.label)
                        .join(', '),
                    })
                  }}
                </span>
                <span
                  v-if="objective.unlocks.length"
                  class="mt-0.5 flex flex-wrap items-center gap-1"
                >
                  <span class="text-surface-500 text-[11px] font-medium uppercase">
                    {{ t('page.storyline.route_unlocks_here') }}:
                  </span>
                  <UBadge
                    v-for="unlock in objective.unlocks"
                    :key="`${objective.id}-${unlock.type}-${unlock.id}`"
                    variant="subtle"
                    size="xs"
                    :color="getUnlockBadgeColor(unlock.type)"
                  >
                    {{ getUnlockLabel(unlock.type, unlock.label) }}
                  </UBadge>
                  <UBadge
                    v-if="objective.hasEstimatedUnlocks"
                    variant="subtle"
                    color="neutral"
                    size="xs"
                  >
                    {{ t('page.storyline.route_unlocks_estimated') }}
                  </UBadge>
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>
      <div
        v-if="shouldShowOptionalSection(chapter)"
        :class="
          chapter.mainObjectives.length || getInterleavedTimelineObjectives(chapter).length
            ? 'mt-2 border-t border-white/5 pt-2'
            : ''
        "
      >
        <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
          {{ t('page.profile.storyline_objectives_optional') }}
        </div>
        <div v-if="chapter.optionalRouteChoices.length" class="mb-1.5 space-y-1.5">
          <div
            v-for="(routeChoice, routeIndex) in chapter.optionalRouteChoices"
            :key="routeChoice.id"
            class="border-info-700/30 bg-info-950/10 rounded-md border p-2"
          >
            <div class="mb-1 flex items-center justify-between gap-2">
              <div class="text-info-300 text-[11px] font-medium tracking-wider uppercase">
                {{ t('page.storyline.route_decision', { index: routeIndex + 1 }) }}
              </div>
              <UBadge variant="subtle" color="info" size="xs">
                {{ t('page.storyline.route_choose_one') }}
              </UBadge>
            </div>
            <div class="grid grid-cols-1 gap-1">
              <label
                v-for="objective in routeChoice.objectives"
                :key="objective.id"
                class="flex items-start gap-1.5 rounded border p-2"
                :class="
                  objective.routeState === 'chosen'
                    ? 'border-success-700/40 bg-success-950/20'
                    : props.readOnly || objective.routeState === 'blocked'
                      ? 'border-error-700/30 bg-error-950/10 cursor-not-allowed opacity-70'
                      : 'bg-surface-900/40 cursor-pointer border-white/10 hover:bg-white/5'
                "
              >
                <input
                  :id="getObjectiveInputId(chapter.id, objective.id)"
                  :name="getObjectiveInputId(chapter.id, objective.id)"
                  type="checkbox"
                  :checked="objective.complete"
                  class="accent-info-500 mt-0.5 shrink-0"
                  :disabled="props.readOnly || objective.routeState === 'blocked'"
                  @change="emit('toggleObjective', chapter.id, objective.id)"
                />
                <span class="min-w-0 flex-1">
                  <span class="flex flex-wrap items-center gap-1">
                    <span
                      class="text-xs"
                      :class="
                        objective.complete ? 'text-surface-500 line-through' : 'text-surface-200'
                      "
                    >
                      {{ objective.description }}
                    </span>
                    <UBadge
                      v-if="objective.routeState === 'chosen'"
                      variant="subtle"
                      color="success"
                      size="xs"
                    >
                      {{ t('page.storyline.route_chosen') }}
                    </UBadge>
                    <UBadge
                      v-else-if="objective.routeState === 'blocked'"
                      variant="subtle"
                      color="error"
                      size="xs"
                    >
                      {{ t('page.storyline.route_blocked') }}
                    </UBadge>
                  </span>
                  <span
                    v-if="objective.routeState === 'chosen'"
                    class="text-success-300 mt-0.5 block text-[11px] leading-tight"
                  >
                    {{ t('page.storyline.route_selected_hint') }}
                  </span>
                  <span
                    v-else-if="
                      objective.routeState === 'blocked' &&
                      objective.routeBlockingAlternatives.length
                    "
                    class="text-error-300 mt-0.5 block text-[11px] leading-tight"
                  >
                    {{
                      t('page.storyline.route_blocked_by', {
                        objectives: objective.routeBlockingAlternatives
                          .map((entry) => entry.label)
                          .join(', '),
                      })
                    }}
                  </span>
                  <span
                    v-if="objective.unlocks.length"
                    class="mt-0.5 flex flex-wrap items-center gap-1"
                  >
                    <span class="text-surface-500 text-[11px] font-medium uppercase">
                      {{ t('page.storyline.route_unlocks_here') }}:
                    </span>
                    <UBadge
                      v-for="unlock in objective.unlocks"
                      :key="`${objective.id}-${unlock.type}-${unlock.id}`"
                      variant="subtle"
                      size="xs"
                      :color="getUnlockBadgeColor(unlock.type)"
                    >
                      {{ getUnlockLabel(unlock.type, unlock.label) }}
                    </UBadge>
                    <UBadge
                      v-if="objective.hasEstimatedUnlocks"
                      variant="subtle"
                      color="neutral"
                      size="xs"
                    >
                      {{ t('page.storyline.route_unlocks_estimated') }}
                    </UBadge>
                  </span>
                </span>
              </label>
            </div>
            <div
              v-if="routeChoice.chosenObjectiveId"
              class="text-info-200 mt-1 text-[11px] leading-tight"
            >
              {{ t('page.storyline.route_switch_hint') }}
            </div>
          </div>
        </div>
        <div v-if="shouldShowStandaloneOptionalLinearObjectives(chapter)" class="mb-1">
          <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
            {{ t('page.storyline.route_optional_steps') }}
          </div>
        </div>
        <div v-if="shouldShowStandaloneOptionalLinearObjectives(chapter)" class="space-y-0.5">
          <div
            v-for="objective in sortObjectivesByOrder(chapter.optionalLinearObjectives)"
            :key="objective.id"
          >
            <label
              class="flex items-start gap-1.5 rounded px-1 py-0.5"
              :class="
                props.readOnly || objective.routeState === 'blocked'
                  ? 'cursor-not-allowed opacity-65'
                  : 'cursor-pointer hover:bg-white/5'
              "
            >
              <input
                :id="getObjectiveInputId(chapter.id, objective.id)"
                :name="getObjectiveInputId(chapter.id, objective.id)"
                type="checkbox"
                :checked="objective.complete"
                class="accent-warning-500 mt-0.5 shrink-0"
                :disabled="props.readOnly || objective.routeState === 'blocked'"
                @change="emit('toggleObjective', chapter.id, objective.id)"
              />
              <span class="min-w-0 flex-1">
                <span class="flex flex-wrap items-center gap-1">
                  <UBadge variant="subtle" color="warning" size="xs">
                    {{ t('page.storyline.route_optional') }}
                  </UBadge>
                  <span
                    class="text-xs"
                    :class="
                      objective.complete
                        ? 'text-surface-500 min-w-0 flex-1 wrap-break-word line-through'
                        : 'text-surface-300 min-w-0 flex-1 wrap-break-word'
                    "
                  >
                    {{ objective.description }}
                  </span>
                  <UBadge
                    v-if="objective.routeState === 'chosen'"
                    variant="subtle"
                    color="success"
                    size="xs"
                  >
                    {{ t('page.storyline.route_chosen') }}
                  </UBadge>
                  <UBadge
                    v-else-if="objective.routeState === 'blocked'"
                    variant="subtle"
                    color="error"
                    size="xs"
                  >
                    {{ t('page.storyline.route_blocked') }}
                  </UBadge>
                  <UBadge
                    v-else-if="objective.routeAlternatives.length"
                    variant="subtle"
                    color="warning"
                    size="xs"
                  >
                    {{ t('page.storyline.route_choice') }}
                  </UBadge>
                </span>
                <span
                  v-if="
                    objective.routeState === 'blocked' && objective.routeBlockingAlternatives.length
                  "
                  class="text-error-300 mt-0.5 block text-[11px] leading-tight"
                >
                  {{
                    t('page.storyline.route_blocked_by', {
                      objectives: objective.routeBlockingAlternatives
                        .map((entry) => entry.label)
                        .join(', '),
                    })
                  }}
                </span>
                <span
                  v-else-if="objective.routeAlternatives.length"
                  class="text-surface-500 mt-0.5 block text-[11px] leading-tight"
                >
                  {{
                    t('page.storyline.route_blocks', {
                      objectives: objective.routeAlternatives
                        .map((entry) => entry.label)
                        .join(', '),
                    })
                  }}
                </span>
                <span
                  v-if="objective.unlocks.length"
                  class="mt-0.5 flex flex-wrap items-center gap-1"
                >
                  <span class="text-surface-500 text-[11px] font-medium uppercase">
                    {{ t('page.storyline.route_unlocks_here') }}:
                  </span>
                  <UBadge
                    v-for="unlock in objective.unlocks"
                    :key="`${objective.id}-${unlock.type}-${unlock.id}`"
                    variant="subtle"
                    size="xs"
                    :color="getUnlockBadgeColor(unlock.type)"
                  >
                    {{ getUnlockLabel(unlock.type, unlock.label) }}
                  </UBadge>
                  <UBadge
                    v-if="objective.hasEstimatedUnlocks"
                    variant="subtle"
                    color="neutral"
                    size="xs"
                  >
                    {{ t('page.storyline.route_unlocks_estimated') }}
                  </UBadge>
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
    <div
      v-if="chapter.chapterUnlocks.length"
      class="bg-surface-950/20 mb-2 rounded-md border border-white/5 p-2"
    >
      <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
        {{ t('page.storyline.route_unlocks_chapter') }}
      </div>
      <div class="flex flex-wrap gap-1">
        <UBadge
          v-for="unlock in chapter.chapterUnlocks"
          :key="`chapter-${chapter.id}-${unlock.type}-${unlock.id}`"
          variant="subtle"
          :color="getUnlockBadgeColor(unlock.type)"
          size="xs"
        >
          {{ getUnlockLabel(unlock.type, unlock.label) }}
        </UBadge>
      </div>
    </div>
    <div
      v-if="canToggleChapter"
      class="mt-3 flex items-center justify-end border-t border-white/5 pt-2"
    >
      <UButton
        size="xs"
        :variant="chapter.complete ? 'soft' : 'ghost'"
        :color="chapter.complete ? 'success' : 'neutral'"
        @click="emit('toggleChapter', chapter.id)"
      >
        {{ chapter.complete ? t('page.storyline.completed') : t('page.storyline.mark_complete') }}
      </UButton>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useWikiLink } from '@/composables/useWikiLink';
  import type {
    StorylineNormalizedChapterView,
    StorylineObjectiveProgress,
    StorylineObjectiveUnlockView,
  } from '@/composables/useStorylineChapters';
  interface Props {
    chapter: StorylineNormalizedChapterView;
    readOnly?: boolean;
    showChapterActions?: boolean;
  }
  const props = withDefaults(defineProps<Props>(), {
    showChapterActions: true,
  });
  const { chapter } = toRefs(props);
  const emit = defineEmits<{
    toggleChapter: [chapterId: string];
    toggleObjective: [chapterId: string, objectiveId: string];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const { toWikiUrl } = useWikiLink();
  const getUnlockBadgeColor = (type: StorylineObjectiveUnlockView['type']) => {
    if (type === 'map') {
      return 'primary';
    }
    if (type === 'trader') {
      return 'warning';
    }
    return 'success';
  };
  const getUnlockLabel = (type: StorylineObjectiveUnlockView['type'], label: string) => {
    if (type === 'map') {
      return t('page.storyline.route_unlock_map', { name: label });
    }
    if (type === 'trader') {
      return t('page.storyline.route_unlock_trader', { name: label });
    }
    return t('page.storyline.route_unlock_reward', { name: label });
  };
  const getEndingBadgeLabel = (routeState: StorylineObjectiveProgress['routeState']) => {
    if (routeState === 'chosen') {
      return t('page.storyline.route_chosen');
    }
    if (routeState === 'blocked') {
      return t('page.storyline.route_blocked');
    }
    return t('page.storyline.route_available');
  };
  const getEndingBadgeColor = (routeState: StorylineObjectiveProgress['routeState']) => {
    if (routeState === 'chosen') {
      return 'success';
    }
    if (routeState === 'blocked') {
      return 'error';
    }
    return 'neutral';
  };
  const getEndingCardClass = (routeState: StorylineObjectiveProgress['routeState']) => {
    if (routeState === 'chosen') {
      return 'border-success-700/40 bg-success-950/20';
    }
    if (routeState === 'blocked') {
      return 'border-error-700/30 bg-error-950/10 opacity-70';
    }
    return 'border-white/10 bg-surface-900/40';
  };
  const sortObjectivesByOrder = (objectives: StorylineObjectiveProgress[]) => {
    return [...objectives].sort((left, right) => {
      const leftOrder = left.order;
      const rightOrder = right.order;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.id.localeCompare(right.id);
    });
  };
  const getInterleavedTimelineObjectives = (
    chapter: StorylineNormalizedChapterView
  ): StorylineObjectiveProgress[] => {
    if (!chapter.mainObjectives.length) {
      return [];
    }
    return sortObjectivesByOrder([
      ...chapter.mainLinearObjectives,
      ...chapter.optionalLinearObjectives,
    ]);
  };
  const shouldShowStandaloneOptionalLinearObjectives = (
    chapter: StorylineNormalizedChapterView
  ) => {
    return chapter.mainObjectives.length === 0 && chapter.optionalLinearObjectives.length > 0;
  };
  const shouldShowOptionalSection = (chapter: StorylineNormalizedChapterView) => {
    return (
      chapter.optionalRouteChoices.length > 0 ||
      shouldShowStandaloneOptionalLinearObjectives(chapter)
    );
  };
  const canToggleChapter = computed(() => {
    return props.showChapterActions !== false && !props.readOnly;
  });
  const getObjectiveInputId = (chapterId: string, objectiveId: string) => {
    return `storyline-objective-${chapterId}-${objectiveId}`;
  };
</script>
