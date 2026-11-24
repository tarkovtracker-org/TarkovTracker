<template>
  <div id="skills" class="scroll-mt-16">
    <GenericCard
      icon="mdi-brain"
      icon-color="info"
      highlight-color="info"
      :fill-height="false"
      :title="$t('settings.skills.title')"
      title-classes="text-lg font-semibold"
    >
      <template #title-right>
        <div
          class="flex flex-wrap items-center gap-1"
          role="group"
          :aria-label="$t('settings.skills.sort_label')"
        >
          <UButton
            v-for="option in sortOptions"
            :key="option.value"
            size="xs"
            :label="option.label"
            v-bind="getToggleProps(skillSortMode === option.value, 'solid', 'outline')"
            @click="setSkillSortMode(option.value)"
          />
        </div>
      </template>
      <template #content>
        <div class="space-y-4 px-4 py-4">
          <p class="text-surface-400 text-xs">
            {{ $t('settings.skills.intro', { max: MAX_SKILL_LEVEL }) }}
          </p>
          <div
            v-if="allGameSkills.length > 0"
            class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center"
          >
            <UInput
              v-model="searchQuery"
              type="search"
              icon="i-mdi-magnify"
              size="sm"
              class="w-full md:w-60"
              :placeholder="$t('settings.skills.search_placeholder')"
              :aria-label="$t('settings.skills.search_placeholder')"
            >
              <template v-if="searchQuery" #trailing>
                <UButton
                  icon="i-mdi-close"
                  size="xs"
                  variant="link"
                  color="neutral"
                  :aria-label="$t('common.clear_search')"
                  @click="searchQuery = ''"
                />
              </template>
            </UInput>
            <div
              class="flex flex-wrap items-center gap-1"
              role="group"
              :aria-label="$t('settings.skills.filter_label')"
            >
              <UButton
                v-for="option in filterOptions"
                :key="option.value"
                size="xs"
                v-bind="getToggleProps(skillFilter === option.value, 'soft', 'ghost')"
                :disabled="option.disabled"
                @click="skillFilter = option.value"
              >
                {{ option.label }}
                <span class="text-surface-400 tabular-nums">{{ option.count }}</span>
              </UButton>
            </div>
            <UButton
              v-if="adjustedSkills.length > 0"
              icon="i-mdi-restore"
              size="xs"
              variant="ghost"
              color="neutral"
              class="md:ml-auto"
              @click="showResetAllDialog = true"
            >
              {{ $t('settings.skills.reset_all') }}
            </UButton>
          </div>
          <div v-if="visibleSkills.length > 0" class="space-y-5">
            <section
              v-for="group in skillGroups"
              :key="group.category ?? 'all'"
              :aria-label="group.label"
            >
              <h3
                v-if="group.label"
                class="text-surface-400 mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase"
              >
                {{ group.label }}
                <span class="bg-surface-700 h-px flex-1" aria-hidden="true" />
              </h3>
              <div class="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <SkillLevelRow
                  v-for="skill in group.skills"
                  :key="skill.key"
                  :skill="skill"
                  :level="getSkillLevel(skill.key)"
                  :quest-level="getQuestSkillLevel(skill.key)"
                  :offset="getSkillOffset(skill.key)"
                  :highlighted="highlightedSkillKey === skill.key"
                  @input-keydown="preventInvalidInput"
                  @input-paste="(event: ClipboardEvent) => onPaste(event, skill.key)"
                  @input-focus-change="resetSkillLimitToast"
                  @update-level="(value: string | number) => updateSkillLevel(skill.key, value)"
                  @reset="resetOffset(skill.key)"
                />
              </div>
            </section>
          </div>
          <div
            v-else-if="allGameSkills.length > 0"
            class="text-surface-400 flex flex-col items-center gap-2 py-6 text-center text-sm"
          >
            {{ $t('settings.skills.no_matches') }}
            <UButton size="xs" variant="soft" color="neutral" @click="clearFilters">
              {{ $t('settings.skills.clear_filters') }}
            </UButton>
          </div>
          <div v-else class="text-surface-400 py-6 text-center text-sm">
            {{ $t('settings.skills.no_skills') }}
          </div>
        </div>
      </template>
    </GenericCard>
    <UModal v-model:open="showResetAllDialog">
      <template #content>
        <div class="p-5">
          <div class="mb-4 flex items-center gap-3">
            <div class="bg-error-500/15 rounded-full p-2">
              <UIcon name="i-mdi-restore" class="text-error-400 h-5 w-5" />
            </div>
            <h3 class="text-surface-100 text-base font-semibold">
              {{ $t('settings.skills.reset_all_title') }}
            </h3>
          </div>
          <p class="text-surface-300 mb-5 text-sm">
            {{ $t('settings.skills.reset_all_body', { count: adjustedSkills.length }) }}
          </p>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="showResetAllDialog = false">
              {{ $t('common.cancel') }}
            </UButton>
            <UButton color="error" variant="soft" @click="resetAllAdjustments">
              {{ $t('settings.skills.reset_all_confirm') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useSkillCalculation } from '@/composables/useSkillCalculation';
  import SkillLevelRow from '@/features/settings/SkillLevelRow.vue';
  import { getSkillCardId } from '@/features/settings/skillsCardIds';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import {
    getSkillCategory,
    MAX_SKILL_LEVEL,
    SKILL_CATEGORY_ORDER,
    type SkillCategory,
    type SkillSortMode,
  } from '@/utils/constants';
  import { getQueryString } from '@/utils/routeHelpers';
  import { formatSkillName } from '@/utils/skillHelpers';
  type GameSkill = ReturnType<typeof useSkillCalculation>['allGameSkills']['value'][number];
  type SkillFilter = 'all' | 'needed' | 'adjusted';
  type ButtonVariant = 'solid' | 'outline' | 'soft' | 'ghost';
  interface SkillGroup {
    category: SkillCategory | null;
    label?: string;
    skills: GameSkill[];
  }
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const router = useRouter();
  const skillCalculation = useSkillCalculation();
  const preferencesStore = usePreferencesStore();
  const allGameSkills = computed(() => skillCalculation.allGameSkills.value);
  const skillSortMode = computed(() => preferencesStore.getSkillSortMode);
  const searchQuery = ref('');
  const skillFilter = ref<SkillFilter>('all');
  const showResetAllDialog = ref(false);
  const highlightedSkillKey = ref<string | null>(null);
  const skillHighlightTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
  const setSkillSortMode = (mode: SkillSortMode) => {
    preferencesStore.setSkillSortMode(mode);
  };
  const toast = useToast();
  const skillLimitToastShown = ref(false);
  const getSkillLevel = (skillKey: string) => skillCalculation.getSkillLevel(skillKey);
  const getQuestSkillLevel = (skillKey: string) => skillCalculation.getQuestSkillLevel(skillKey);
  const getSkillOffset = (skillKey: string) => skillCalculation.getSkillOffset(skillKey);
  const getToggleProps = (active: boolean, activeVariant: ButtonVariant, idle: ButtonVariant) => ({
    variant: active ? activeVariant : idle,
    color: active ? ('primary' as const) : ('neutral' as const),
    'aria-pressed': active,
  });
  const sortOptions = computed<{ value: SkillSortMode; label: string }[]>(() => [
    { value: 'ingame', label: t('settings.skills.sort.ingame') },
    { value: 'priority', label: t('common.priority') },
  ]);
  const isNeededSkill = (skill: GameSkill): boolean => skill.requiredLevels.length > 0;
  const isAdjustedSkill = (skill: GameSkill): boolean => getSkillOffset(skill.key) !== 0;
  const neededSkillCount = computed(() => allGameSkills.value.filter(isNeededSkill).length);
  const adjustedSkills = computed(() => allGameSkills.value.filter(isAdjustedSkill));
  const createFilterOption = (value: SkillFilter, label: string, count: number) => ({
    value,
    label,
    count,
    disabled: count === 0 && skillFilter.value !== value,
  });
  const filterOptions = computed(() => [
    createFilterOption('all', t('common.all'), allGameSkills.value.length),
    createFilterOption('needed', t('settings.skills.filter.needed'), neededSkillCount.value),
    createFilterOption(
      'adjusted',
      t('settings.skills.filter.adjusted'),
      adjustedSkills.value.length
    ),
  ]);
  const FILTER_PREDICATES: Record<SkillFilter, (skill: GameSkill) => boolean> = {
    all: () => true,
    needed: isNeededSkill,
    adjusted: isAdjustedSkill,
  };
  const normalizedSearch = computed(() => searchQuery.value.trim().toLocaleLowerCase());
  const matchesSearch = (skill: GameSkill): boolean => {
    const query = normalizedSearch.value;
    if (!query) return true;
    return formatSkillName(skill.name).toLocaleLowerCase().includes(query);
  };
  const visibleSkills = computed(() =>
    allGameSkills.value.filter(
      (skill) => FILTER_PREDICATES[skillFilter.value](skill) && matchesSearch(skill)
    )
  );
  const skillGroups = computed<SkillGroup[]>(() => {
    if (skillSortMode.value !== 'ingame') {
      return [{ category: null, skills: visibleSkills.value }];
    }
    return SKILL_CATEGORY_ORDER.map((category) => ({
      category,
      label: t(`settings.skills.categories.${category}`),
      skills: visibleSkills.value.filter((skill) => getSkillCategory(skill) === category),
    })).filter((group) => group.skills.length > 0);
  });
  const clearFilters = () => {
    searchQuery.value = '';
    skillFilter.value = 'all';
  };
  const showInvalidSkillValueToast = () => {
    toast.add({
      id: 'skill-invalid-value-error',
      title: t('common.validation_error'),
      description: t('settings.skills.valid_range', `Valid range: 0-${MAX_SKILL_LEVEL}`),
      color: 'error',
      icon: 'i-mdi-alert-circle',
    });
  };
  const setTotalSkillLevel = (skillName: string, totalLevel: number) => {
    const isUpdated = skillCalculation.setTotalSkillLevel(skillName, totalLevel);
    if (!isUpdated) {
      showInvalidSkillValueToast();
    }
  };
  const updateSkillLevel = (skillName: string, value: string | number) => {
    if (value === '') {
      setTotalSkillLevel(skillName, 0);
      return;
    }
    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (trimmedValue === '.' || trimmedValue.endsWith('.')) {
        return;
      }
      if (!/^\d*\.?\d{0,2}$/.test(trimmedValue)) {
        return;
      }
    }
    const numValue = typeof value === 'string' ? Number(value) : value;
    if (Number.isFinite(numValue) && numValue >= 0) {
      const clampedValue = Math.min(Math.max(numValue, 0), MAX_SKILL_LEVEL);
      setTotalSkillLevel(skillName, clampedValue);
    }
  };
  const preventInvalidInput = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      return;
    }
    if (['-', '+', 'e'].includes(e.key)) {
      e.preventDefault();
      return;
    }
    if (
      [
        'Backspace',
        'Delete',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
        'PageUp',
        'PageDown',
        'Tab',
        'Enter',
      ].includes(e.key)
    ) {
      return;
    }
    const target = e.currentTarget instanceof HTMLInputElement ? e.currentTarget : null;
    if (!target) {
      return;
    }
    const currentVal = target.value;
    const selectionStart = target.selectionStart ?? 0;
    const selectionEnd = target.selectionEnd ?? currentVal.length;
    const nextValStr = currentVal.slice(0, selectionStart) + e.key + currentVal.slice(selectionEnd);
    const nextVal = parseFloat(nextValStr);
    const isNumeric = /^\d*\.?\d{0,2}$/.test(nextValStr);
    if (!isNumeric || Number.isNaN(nextVal) || nextVal > MAX_SKILL_LEVEL) {
      e.preventDefault();
      showSkillLimitToast();
    }
  };
  const showSkillLimitToast = () => {
    if (skillLimitToastShown.value) return;
    skillLimitToastShown.value = true;
    toast.add({
      id: 'skill-limit-error',
      title: t('settings.skills.limit_exceeded'),
      description: t('settings.skills.max_level', `Maximum skill level is ${MAX_SKILL_LEVEL}.`),
      color: 'error',
      icon: 'i-mdi-alert-circle',
    });
  };
  const resetSkillLimitToast = () => {
    skillLimitToastShown.value = false;
    toast.remove('skill-limit-error');
  };
  const onPaste = (e: ClipboardEvent, skillName: string) => {
    e.preventDefault();
    const pastedText = e.clipboardData?.getData('text');
    if (!pastedText) return;
    const numVal = Number(pastedText.trim());
    if (Number.isFinite(numVal)) {
      const clamped = Math.min(Math.max(numVal, 0), MAX_SKILL_LEVEL);
      setTotalSkillLevel(skillName, clamped);
    }
  };
  const resetOffset = (skillName: string) => {
    skillCalculation.resetSkillOffset(skillName);
  };
  const resetAllAdjustments = () => {
    adjustedSkills.value.forEach((skill) => skillCalculation.resetSkillOffset(skill.key));
    showResetAllDialog.value = false;
    if (skillFilter.value === 'adjusted') skillFilter.value = 'all';
  };
  const clearSkillHighlight = () => {
    if (skillHighlightTimeout.value) {
      clearTimeout(skillHighlightTimeout.value);
      skillHighlightTimeout.value = null;
    }
    highlightedSkillKey.value = null;
  };
  const resolveRouteSkill = () => {
    const skillQuery = getQueryString(route.query.skill);
    if (!skillQuery || allGameSkills.value.length === 0) return null;
    return skillCalculation.getSkillMetadata(skillQuery);
  };
  const revealSkillCard = async (skillKey: string): Promise<HTMLElement | null> => {
    if (!visibleSkills.value.some((skill) => skill.key === skillKey)) {
      clearFilters();
      await nextTick();
    }
    await nextTick();
    return document.getElementById(getSkillCardId(skillKey));
  };
  const highlightSkillCard = (skillKey: string, element: HTMLElement) => {
    clearSkillHighlight();
    highlightedSkillKey.value = skillKey;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    skillHighlightTimeout.value = setTimeout(() => {
      highlightedSkillKey.value = null;
      skillHighlightTimeout.value = null;
    }, 2500);
  };
  const clearSkillQuery = () => {
    const nextQuery = { ...route.query };
    delete nextQuery.skill;
    router.replace({
      hash: route.hash,
      path: route.path,
      query: nextQuery,
    });
  };
  const focusSkillFromRoute = async () => {
    const targetSkill = resolveRouteSkill();
    if (!targetSkill) return;
    const targetElement = await revealSkillCard(targetSkill.key);
    if (!targetElement) return;
    highlightSkillCard(targetSkill.key, targetElement);
    clearSkillQuery();
  };
  const skillAliasesForMigration = computed(() => {
    return Array.from(
      new Set(
        allGameSkills.value.flatMap((skill) =>
          [skill.key, skill.id, skill.name].filter((alias): alias is string => Boolean(alias))
        )
      )
    ).sort((a, b) => a.localeCompare(b));
  });
  let lastSkillAliasMigrationSignature = '';
  watch(
    () => skillAliasesForMigration.value.join('|'),
    (signature) => {
      if (!signature || signature === lastSkillAliasMigrationSignature) return;
      lastSkillAliasMigrationSignature = signature;
      skillCalculation.migrateLegacySkillOffsets();
    },
    { immediate: true }
  );
  watch(
    [() => route.query.skill, () => allGameSkills.value.length],
    async () => {
      await focusSkillFromRoute();
    },
    { immediate: true }
  );
  onBeforeUnmount(() => {
    clearSkillHighlight();
  });
</script>
