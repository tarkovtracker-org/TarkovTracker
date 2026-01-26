<template>
  <GenericCard
    icon="mdi-brain"
    icon-color="cyan-400"
    highlight-color="blue"
    :fill-height="false"
    :title="$t('settings.skills.title', 'Skills Management')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-4 px-4 py-4">
        <!-- Explanation -->
        <UAlert icon="i-mdi-information" color="info" variant="soft" class="text-sm">
          <template #description>
            {{
              $t(
                'settings.skills.explanation',
                'All skills from game data are shown below. Quest rewards are auto-calculated. Use offsets to add skills gained through gameplay.'
              )
            }}
          </template>
        </UAlert>
        <!-- Usage Hint -->
        <p class="text-surface-400 text-sm">
          {{
            $t(
              'settings.skills.manual_hint',
              'Enter your total skill level from the game to adjust the offset automatically.'
            )
          }}
        </p>
        <!-- Skills Grid -->
        <div
          v-if="allGameSkills.length > 0"
          class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          <div
            v-for="skill in visibleSkills"
            :key="skill.name"
            class="border-surface-700 bg-surface-800/30 rounded-lg border p-3"
          >
            <!-- Skill Header -->
            <div class="mb-2 flex items-center gap-3">
              <!-- Skill Icon with Hover Pop-out -->
              <div class="group relative shrink-0">
                <img
                  v-if="skill.imageLink"
                  :src="skill.imageLink"
                  :alt="skill.name"
                  class="skill-icon h-10 w-10 rounded object-contain transition-transform duration-200 ease-out"
                  loading="lazy"
                />
                <!-- Fallback placeholder if no image -->
                <div
                  v-else
                  class="bg-surface-700 flex h-10 w-10 items-center justify-center rounded text-xs text-gray-400"
                >
                  ?
                </div>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="text-surface-100 truncate text-base font-semibold">
                    {{ formatSkillName(skill.name) }}
                  </span>
                  <!-- Required Badge -->
                  <AppTooltip
                    v-if="skill.requiredByTasks.length > 0"
                    :text="`Required for: ${skill.requiredByTasks.join(', ')}`"
                  >
                    <span
                      class="shrink-0 rounded bg-orange-500/20 px-1.5 py-0.5 text-xs text-orange-400"
                    >
                      Req
                    </span>
                  </AppTooltip>
                  <!-- Required Levels Badge -->
                  <AppTooltip
                    v-if="skill.requiredLevels.length > 0"
                    :text="`Required levels: ${skill.requiredLevels.join(', ')}`"
                  >
                    <span
                      class="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-400"
                    >
                      Lv {{ formatRequiredLevels(skill.requiredLevels) }}
                    </span>
                  </AppTooltip>
                </div>
                <!-- Skill Info -->
                <div class="text-surface-500 truncate text-xs">
                  <span v-if="skill.requiredByTasks.length > 0">
                    Req: {{ skill.requiredByTasks.length }}
                  </span>
                  <span
                    v-if="skill.requiredByTasks.length > 0 && skill.rewardedByTasks.length > 0"
                    class="mx-1"
                  >
                    •
                  </span>
                  <span v-if="skill.rewardedByTasks.length > 0">
                    Reward: {{ skill.rewardedByTasks.length }}
                  </span>
                </div>
              </div>
              <!-- Total Level -->
              <span class="text-primary-400 shrink-0 text-base font-bold">
                {{ getSkillLevel(skill.name) }}
              </span>
            </div>
            <!-- Breakdown -->
            <div class="mb-2 flex gap-3 text-xs">
              <div class="text-surface-400 flex-1">
                Quest:
                <span class="text-surface-200 font-medium">
                  {{ getQuestSkillLevel(skill.name) }}
                </span>
              </div>
              <div class="text-surface-400 flex-1">
                Offset:
                <span class="text-surface-200 font-medium">{{ getSkillOffset(skill.name) }}</span>
              </div>
            </div>
            <!-- Skill Level Input -->
            <div class="flex items-center gap-2">
              <UInput
                :model-value="getSkillLevel(skill.name)"
                type="number"
                :min="0"
                placeholder="0"
                size="sm"
                class="flex-1"
                @update:model-value="(value) => updateSkillLevel(skill.name, value)"
              />
              <UButton
                icon="i-mdi-refresh"
                size="sm"
                variant="soft"
                color="neutral"
                :disabled="getSkillOffset(skill.name) === 0"
                @click="resetOffset(skill.name)"
              />
            </div>
          </div>
        </div>
        <div v-if="hasShowAllToggle" class="flex justify-center pt-2">
          <UButton
            :label="
              showAllSkills
                ? $t('settings.skills.show_less', 'Show less')
                : $t('settings.skills.show_all', 'Show all')
            "
            variant="soft"
            color="neutral"
            @click="showAllSkills = !showAllSkills"
          />
        </div>
        <!-- No Skills State -->
        <div v-if="allGameSkills.length === 0" class="text-surface-400 py-6 text-center text-sm">
          {{ $t('settings.skills.no_skills', 'No skills found in game data.') }}
        </div>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import { breakpointsTailwind, useBreakpoints } from '@vueuse/core';
  import { computed, ref } from 'vue';
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useSkillCalculation } from '@/composables/useSkillCalculation';
  const skillCalculation = useSkillCalculation();
  // All game skills with metadata
  const allGameSkills = computed(() => skillCalculation.allGameSkills.value);
  const showAllSkills = ref(false);
  const breakpoints = useBreakpoints(breakpointsTailwind);
  const columnsPerRow = computed(() => {
    if (breakpoints.greaterOrEqual('xl').value) return 4;
    if (breakpoints.greaterOrEqual('lg').value) return 3;
    if (breakpoints.greaterOrEqual('sm').value) return 2;
    return 1;
  });
  const lastRequiredLevelIndex = computed(() => {
    const skills = allGameSkills.value;
    for (let index = skills.length - 1; index >= 0; index -= 1) {
      if ((skills[index]?.requiredLevels?.length ?? 0) > 0) return index;
    }
    return -1;
  });
  const collapsedVisibleCount = computed(() => {
    const total = allGameSkills.value.length;
    const lastRequiredIndex = lastRequiredLevelIndex.value;
    if (total === 0) return 0;
    if (lastRequiredIndex < 0) return total;
    const rawCount = lastRequiredIndex + 1;
    return Math.min(total, Math.ceil(rawCount / columnsPerRow.value) * columnsPerRow.value);
  });
  const hasShowAllToggle = computed(() => {
    return collapsedVisibleCount.value < allGameSkills.value.length;
  });
  const visibleSkills = computed(() => {
    if (showAllSkills.value) return allGameSkills.value;
    return allGameSkills.value.slice(0, collapsedVisibleCount.value);
  });
  // Helper: Format skill name (capitalize, handle special cases)
  const formatSkillName = (skillName: string): string => {
    return skillName
      .split(/(?=[A-Z])/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  // Helper: Format required levels for display
  const formatRequiredLevels = (levels: number[]): string => {
    if (levels.length === 0) return '';
    if (levels.length === 1) return String(levels[0]);
    // Show all levels as milestones (e.g., "5,10,15")
    return levels.join(',');
  };
  // Get skill levels from composable
  const getSkillLevel = (skillName: string) => skillCalculation.getSkillLevel(skillName);
  const getQuestSkillLevel = (skillName: string) => skillCalculation.getQuestSkillLevel(skillName);
  const getSkillOffset = (skillName: string) => skillCalculation.getSkillOffset(skillName);
  // Update skill level (calculates offset automatically)
  const updateSkillLevel = (skillName: string, value: string | number) => {
    const numValue = typeof value === 'string' ? parseInt(value, 10) : value;
    if (!isNaN(numValue) && numValue >= 0) {
      skillCalculation.setTotalSkillLevel(skillName, numValue);
    }
  };
  // Reset skill offset to 0
  const resetOffset = (skillName: string) => {
    skillCalculation.resetSkillOffset(skillName);
  };
</script>
<style scoped>
  /* Hover pop-out effect for skill icons */
  .skill-icon {
    position: relative;
    z-index: 1;
  }
  .group:hover .skill-icon {
    transform: scale(2.5);
    z-index: 50;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    border-radius: 0.375rem;
  }
</style>
