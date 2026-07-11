import { defaultState, type UserProgressData } from '@/stores/progressState';
import { getNextProgressEpoch } from '@/stores/tarkov/progressMerge';
import { SPECIAL_STATIONS } from '@/utils/constants';
import { logger } from '@/utils/logger';
import {
  buildSkillKeyAliases,
  collapseSkillOffsets,
  getCanonicalSkillKey,
  resolveSkillKey as resolveSkillAliasKey,
} from '@/utils/skillHelpers';
import { getCompletionFlags } from '@/utils/taskStatus';
import type {
  GameEdition,
  HideoutStation,
  PrestigeLevel,
  StoryChapter,
  Task,
} from '@/types/tarkov';
const MAX_PRESTIGE_LEVEL = 6;
const PRESTIGE_PLAYER_LEVEL_REQUIREMENT = 47;
const NEW_BEGINNING_ID_PATTERN = /^new_beginning_prestige_(\d+)$/i;
const NEW_BEGINNING_WIKI_PATTERN = /\/New_Beginning(?:_\(Prestige_(\d+)\))?(?:[?#].*)?$/i;
const PRESTIGE_STORY_CHAPTER_RULES: Record<number, string[]> = {
  1: ['Tour'],
  2: ['Tour', 'Falling Skies'],
  3: ['Tour'],
  4: ['Tour', 'Blue Fire'],
  5: ['Tour', 'They Are Already Here'],
  6: ['The Ticket'],
};
const PRESTIGE_MANUAL_ITEM_RULES: Partial<Record<number, string[]>> = {
  3: ['Ticket from Tarkov'],
  4: ['Ticket from Tarkov'],
  5: ['Ticket from Tarkov'],
};
export type PrestigeRunSummary = {
  completedHideoutModules: number;
  completedHideoutParts: number;
  completedObjectives: number;
  completedStoryChapters: number;
  completedTasks: number;
  failedTasks: number;
  firstActionAt: number | null;
  lastActionAt: number | null;
  level: number;
  prestigeLevel: number;
};
export type PrestigeRunRecord = {
  createdAt: string;
  id: string;
  mode: 'pvp' | 'pve';
  prestigeFrom: number;
  prestigeTo: number;
  summary: PrestigeRunSummary;
};
export type UserPrestigeRunRow = {
  created_at?: string | null;
  id?: string | null;
  mode?: 'pvp' | 'pve' | null;
  prestige_from?: number | null;
  prestige_to?: number | null;
  summary?: Record<string, unknown> | null;
};
export type PrestigeRequirementStatus = 'manual' | 'met' | 'unmet';
export type PrestigeRequirementKind =
  'hideoutStation' | 'item' | 'playerLevel' | 'skill' | 'storyChapter' | 'task';
export type PrestigeRequirementSource = 'overlay' | 'tarkov.dev' | 'wiki';
export type PrestigeRequirementTaskRole = 'collector' | 'newBeginning' | 'task';
export type PrestigeRequirementRow = {
  currentValue?: number | string | null;
  href?: string;
  id: string;
  kind: PrestigeRequirementKind;
  name: string;
  requiredValue?: number | string;
  source: PrestigeRequirementSource;
  status: PrestigeRequirementStatus;
  targetPrestige: number;
  taskRole?: PrestigeRequirementTaskRole;
  tracked: boolean;
};
type BuildPrestigeRequirementRowsOptions = {
  currentPrestigeLevel: number;
  edition?: Pick<GameEdition, 'defaultCultistCircleLevel' | 'defaultStashLevel'>;
  hideoutStations: HideoutStation[];
  prestigeLevels: PrestigeLevel[];
  pvpProgress: UserProgressData;
  storyChapters: StoryChapter[];
  tasks: Task[];
};
type PrestigeRequirementSummary = {
  allTrackedMet: boolean;
  manualCount: number;
  trackedCount: number;
  trackedMetCount: number;
  unmetTrackedCount: number;
};
const isNewBeginningTask = (task: Pick<Task, 'id' | 'name' | 'wikiLink'>): boolean => {
  if (!task?.id) return false;
  if (NEW_BEGINNING_ID_PATTERN.test(task.id)) return true;
  if (typeof task.wikiLink === 'string' && NEW_BEGINNING_WIKI_PATTERN.test(task.wikiLink)) {
    return true;
  }
  return task.name === 'New Beginning';
};
const inferNewBeginningPrestigeLevel = (task: Pick<Task, 'id' | 'wikiLink'>): number | null => {
  if (typeof task.wikiLink === 'string') {
    const wikiMatch = task.wikiLink.match(NEW_BEGINNING_WIKI_PATTERN);
    if (wikiMatch?.[1]) {
      const parsed = Number.parseInt(wikiMatch[1], 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  const idMatch = task.id.match(NEW_BEGINNING_ID_PATTERN);
  if (!idMatch?.[1]) return null;
  const parsed = Number.parseInt(idMatch[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const isTaskSuccessful = (modeData: UserProgressData, taskId: string): boolean => {
  const flags = getCompletionFlags(modeData.taskCompletions?.[taskId]);
  return flags.complete === true && flags.failed !== true;
};
const buildModeSkillLevels = (
  modeData: UserProgressData,
  tasks: Task[]
): Record<string, number> => {
  const totals: Record<string, number> = {};
  const skillAliases = buildSkillKeyAliases(tasks);
  const resolveSkillKey = (skillName: string): string =>
    resolveSkillAliasKey(skillName, skillAliases);
  tasks
    .filter((task) => isTaskSuccessful(modeData, task.id))
    .forEach((task) => {
      const rewards = task.finishRewards?.skillLevelReward || [];
      rewards.forEach((reward) => {
        const skillKey = getCanonicalSkillKey(reward?.name, reward?.skill?.id);
        if (!skillKey) return;
        totals[skillKey] = (totals[skillKey] || 0) + (reward.level || 0);
      });
    });
  const collapsedOffsets = collapseSkillOffsets(modeData.skillOffsets || {}, resolveSkillKey);
  collapsedOffsets.forEach((entry, skillName) => {
    totals[skillName] = (totals[skillName] || 0) + entry.offset;
  });
  return totals;
};
const buildHideoutStationLevels = (
  stations: HideoutStation[],
  hideoutModules: UserProgressData['hideoutModules'],
  edition?: Pick<GameEdition, 'defaultCultistCircleLevel' | 'defaultStashLevel'>
): Map<string, number> => {
  const stationLevels = new Map<string, number>();
  for (const station of stations) {
    const maxLevel = station.levels?.length ?? 0;
    const defaultStashLevel =
      station.normalizedName === SPECIAL_STATIONS.STASH
        ? Math.min(edition?.defaultStashLevel ?? 0, maxLevel)
        : 0;
    const defaultCultistCircleLevel =
      station.normalizedName === SPECIAL_STATIONS.CULTIST_CIRCLE
        ? Math.min(edition?.defaultCultistCircleLevel ?? 0, maxLevel)
        : 0;
    let currentLevel = 0;
    for (const level of station.levels ?? []) {
      const isManualComplete = hideoutModules[level.id]?.complete === true;
      const isEditionComplete =
        (station.normalizedName === SPECIAL_STATIONS.STASH && level.level <= defaultStashLevel) ||
        (station.normalizedName === SPECIAL_STATIONS.CULTIST_CIRCLE &&
          level.level <= defaultCultistCircleLevel);
      if (isManualComplete || isEditionComplete) {
        currentLevel = Math.max(currentLevel, level.level);
      }
    }
    stationLevels.set(station.id, currentLevel);
  }
  return stationLevels;
};
const buildItemLabel = (count: number | undefined, name: string): string => {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) {
    return name;
  }
  return `${new Intl.NumberFormat('en-US').format(Math.trunc(count))} ${name}`;
};
const findStoryChapterByName = (
  chapters: StoryChapter[],
  chapterName: string
): StoryChapter | undefined => {
  const normalizedTarget = chapterName.trim().toLowerCase();
  return chapters.find((chapter) => chapter.name.trim().toLowerCase() === normalizedTarget);
};
const findNewBeginningTaskForPrestige = (
  tasks: Task[],
  prestigeLevel: number
): Pick<Task, 'id' | 'name' | 'wikiLink'> | undefined => {
  return tasks.find((task) => {
    if (!isNewBeginningTask(task)) return false;
    const inferredLevel = inferNewBeginningPrestigeLevel(task);
    if (inferredLevel !== null) {
      return inferredLevel === prestigeLevel;
    }
    return task.name === 'New Beginning' && prestigeLevel <= 4;
  });
};
const getTaskSortOrder = (row: PrestigeRequirementRow): number => {
  if (row.kind !== 'task') return 0;
  if (row.taskRole === 'collector') return 1;
  if (row.taskRole === 'newBeginning') return 2;
  return 3;
};
const getRequirementSortOrder = (row: PrestigeRequirementRow): number => {
  switch (row.kind) {
    case 'playerLevel':
      return 10;
    case 'task':
      return 20 + getTaskSortOrder(row);
    case 'storyChapter':
      return 30;
    case 'skill':
      return 40;
    case 'hideoutStation':
      return 50;
    case 'item':
      return 60;
    default:
      return 70;
  }
};
const sortPrestigeRequirementRows = (rows: PrestigeRequirementRow[]): PrestigeRequirementRow[] => {
  return [...rows].sort((left, right) => {
    const orderDiff = getRequirementSortOrder(left) - getRequirementSortOrder(right);
    if (orderDiff !== 0) return orderDiff;
    return left.name.localeCompare(right.name);
  });
};
export const clampPrestigeLevel = (level: number): number => {
  return Math.max(0, Math.min(MAX_PRESTIGE_LEVEL, Math.trunc(level)));
};
export const getNextPrestigeLevel = (level: number): number | null => {
  const currentLevel = clampPrestigeLevel(level);
  if (currentLevel >= MAX_PRESTIGE_LEVEL) return null;
  return currentLevel + 1;
};
export const toSafeInteger = (value: unknown, fallback = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.trunc(value);
};
export const collectTimestamp = (timestamps: number[], value: number | undefined) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    timestamps.push(Math.trunc(value));
  }
};
export const buildPrestigeRunSummary = (
  modeData: UserProgressData
): Record<string, number | null> => {
  const taskCompletions = Object.values(modeData.taskCompletions || {});
  const taskObjectives = Object.values(modeData.taskObjectives || {});
  const hideoutModules = Object.values(modeData.hideoutModules || {});
  const hideoutParts = Object.values(modeData.hideoutParts || {});
  const storyChapters = Object.values(modeData.storyChapters || {});
  const completedTasks = taskCompletions.reduce((count, completion) => {
    if (completion?.complete === true && completion?.failed !== true) {
      return count + 1;
    }
    return count;
  }, 0);
  const failedTasks = taskCompletions.reduce((count, completion) => {
    if (completion?.failed === true) {
      return count + 1;
    }
    return count;
  }, 0);
  const completedObjectives = taskObjectives.reduce((count, objective) => {
    if (objective?.complete === true) {
      return count + 1;
    }
    return count;
  }, 0);
  const completedHideoutModules = hideoutModules.reduce((count, module) => {
    if (module?.complete === true) {
      return count + 1;
    }
    return count;
  }, 0);
  const completedHideoutParts = hideoutParts.reduce((count, part) => {
    if (part?.complete === true) {
      return count + 1;
    }
    return count;
  }, 0);
  const completedStoryChapters = storyChapters.reduce((count, chapter) => {
    if (chapter?.complete === true) {
      return count + 1;
    }
    return count;
  }, 0);
  const timestamps: number[] = [];
  for (const completion of taskCompletions) {
    collectTimestamp(timestamps, completion?.timestamp);
  }
  for (const objective of taskObjectives) {
    collectTimestamp(timestamps, objective?.timestamp);
  }
  for (const module of hideoutModules) {
    collectTimestamp(timestamps, module?.timestamp);
  }
  for (const part of hideoutParts) {
    collectTimestamp(timestamps, part?.timestamp);
  }
  for (const chapter of storyChapters) {
    collectTimestamp(timestamps, chapter?.timestamp);
    for (const objective of Object.values(chapter?.objectives || {})) {
      collectTimestamp(timestamps, objective?.timestamp);
    }
  }
  const firstActionAt = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const lastActionAt = timestamps.length > 0 ? Math.max(...timestamps) : null;
  return {
    completedHideoutModules,
    completedHideoutParts,
    completedObjectives,
    completedStoryChapters,
    completedTasks,
    failedTasks,
    firstActionAt,
    lastActionAt,
    level: modeData.level ?? 1,
    prestigeLevel: modeData.prestigeLevel ?? 0,
  };
};
export const buildPrestigeResetData = (
  modeData: UserProgressData,
  nextPrestigeLevel: number
): UserProgressData => ({
  ...structuredClone(defaultState.pvp),
  displayName: modeData.displayName ?? null,
  pmcFaction: modeData.pmcFaction ?? 'USEC',
  prestigeLevel: clampPrestigeLevel(nextPrestigeLevel),
  progressEpoch: getNextProgressEpoch(modeData),
});
export const buildPrestigeRequirementRows = (
  options: BuildPrestigeRequirementRowsOptions
): PrestigeRequirementRow[] => {
  const targetPrestigeLevel = getNextPrestigeLevel(options.currentPrestigeLevel);
  if (!targetPrestigeLevel) return [];
  const prestige = options.prestigeLevels.find(
    (entry) => entry.prestigeLevel === targetPrestigeLevel
  );
  const skillLevels = buildModeSkillLevels(options.pvpProgress, options.tasks);
  const stationLevels = buildHideoutStationLevels(
    options.hideoutStations,
    options.pvpProgress.hideoutModules,
    options.edition
  );
  const currentPlayerLevel = options.pvpProgress.level ?? 1;
  const rows: PrestigeRequirementRow[] = [];
  const rowIds = new Set<string>();
  let hasNewBeginningRequirement = false;
  let hasPlayerLevelRequirement = false;
  const pushRow = (row: PrestigeRequirementRow) => {
    if (rowIds.has(row.id)) return;
    rowIds.add(row.id);
    rows.push(row);
  };
  for (const condition of prestige?.conditions || []) {
    if (condition.__typename === 'TaskObjectivePlayerLevel') {
      const apiRequiredLevel = toSafeInteger(condition.playerLevel, 0);
      const requiredLevel =
        apiRequiredLevel > 0 ? apiRequiredLevel : PRESTIGE_PLAYER_LEVEL_REQUIREMENT;
      hasPlayerLevelRequirement = true;
      if (apiRequiredLevel <= 0) {
        logger.warn(
          '[Prestige] Missing player level requirement in prestige metadata, using wiki fallback',
          {
            prestigeId: prestige?.id ?? null,
            targetPrestigeLevel,
          }
        );
      }
      pushRow({
        currentValue: currentPlayerLevel,
        id: `player-level:${targetPrestigeLevel}`,
        kind: 'playerLevel',
        name: 'Level',
        requiredValue: requiredLevel,
        source: apiRequiredLevel > 0 ? 'tarkov.dev' : 'wiki',
        status: currentPlayerLevel >= requiredLevel ? 'met' : 'unmet',
        targetPrestige: targetPrestigeLevel,
        tracked: true,
      });
      continue;
    }
    if (condition.__typename === 'TaskObjectiveTaskStatus' && condition.task?.id) {
      const taskName = condition.task.name || 'Task';
      const taskRole: PrestigeRequirementTaskRole =
        taskName === 'Collector'
          ? 'collector'
          : isNewBeginningTask({
                id: condition.task.id,
                name: taskName,
                wikiLink: condition.task.wikiLink,
              })
            ? 'newBeginning'
            : 'task';
      if (taskRole === 'newBeginning') {
        hasNewBeginningRequirement = true;
      }
      pushRow({
        currentValue: isTaskSuccessful(options.pvpProgress, condition.task.id)
          ? 'complete'
          : 'incomplete',
        href: condition.task.wikiLink,
        id: `task:${condition.task.id}`,
        kind: 'task',
        name: taskName,
        source: 'tarkov.dev',
        status: isTaskSuccessful(options.pvpProgress, condition.task.id) ? 'met' : 'unmet',
        targetPrestige: targetPrestigeLevel,
        taskRole,
        tracked: true,
      });
      continue;
    }
    if (condition.__typename === 'TaskObjectiveSkill' && condition.skillLevel?.name) {
      const skillName = condition.skillLevel.name;
      const requiredLevel = Math.max(0, condition.skillLevel.level || 0);
      const skillKey = getCanonicalSkillKey(skillName, condition.skillLevel.skill?.id) || skillName;
      const currentLevel = skillLevels[skillKey] || 0;
      pushRow({
        currentValue: currentLevel,
        id: `skill:${skillKey}:${requiredLevel}`,
        kind: 'skill',
        name: skillName,
        requiredValue: requiredLevel,
        source: 'tarkov.dev',
        status: currentLevel >= requiredLevel ? 'met' : 'unmet',
        targetPrestige: targetPrestigeLevel,
        tracked: true,
      });
      continue;
    }
    if (condition.__typename === 'TaskObjectiveHideoutStation' && condition.hideoutStation?.id) {
      const stationId = condition.hideoutStation.id;
      const requiredLevel = Math.max(0, toSafeInteger(condition.stationLevel, 0));
      const currentLevel = stationLevels.get(stationId) ?? 0;
      pushRow({
        currentValue: currentLevel,
        id: `hideout:${stationId}:${requiredLevel}`,
        kind: 'hideoutStation',
        name: condition.hideoutStation.name || 'Hideout Station',
        requiredValue: requiredLevel,
        source: 'tarkov.dev',
        status: currentLevel >= requiredLevel ? 'met' : 'unmet',
        targetPrestige: targetPrestigeLevel,
        tracked: true,
      });
      continue;
    }
    if (condition.__typename === 'TaskObjectiveItem') {
      const itemName = condition.items?.[0]?.name || 'Item';
      pushRow({
        currentValue: null,
        href: condition.items?.[0]?.wikiLink,
        id: `item:${itemName}:${condition.count || 0}`,
        kind: 'item',
        name: itemName,
        requiredValue: condition.count || 0,
        source: 'tarkov.dev',
        status: 'manual',
        targetPrestige: targetPrestigeLevel,
        tracked: false,
      });
    }
  }
  if (!hasPlayerLevelRequirement) {
    logger.warn(
      '[Prestige] Prestige metadata missing player level condition, using wiki fallback',
      {
        prestigeId: prestige?.id ?? null,
        targetPrestigeLevel,
      }
    );
    pushRow({
      currentValue: currentPlayerLevel,
      id: `player-level:${targetPrestigeLevel}`,
      kind: 'playerLevel',
      name: 'Level',
      requiredValue: PRESTIGE_PLAYER_LEVEL_REQUIREMENT,
      source: 'wiki',
      status: currentPlayerLevel >= PRESTIGE_PLAYER_LEVEL_REQUIREMENT ? 'met' : 'unmet',
      targetPrestige: targetPrestigeLevel,
      tracked: true,
    });
  }
  if (!hasNewBeginningRequirement) {
    const newBeginningTask = findNewBeginningTaskForPrestige(options.tasks, targetPrestigeLevel);
    if (newBeginningTask) {
      pushRow({
        currentValue: isTaskSuccessful(options.pvpProgress, newBeginningTask.id)
          ? 'complete'
          : 'incomplete',
        href: newBeginningTask.wikiLink,
        id: `task:${newBeginningTask.id}`,
        kind: 'task',
        name: newBeginningTask.name || 'New Beginning',
        source: 'overlay',
        status: isTaskSuccessful(options.pvpProgress, newBeginningTask.id) ? 'met' : 'unmet',
        targetPrestige: targetPrestigeLevel,
        taskRole: 'newBeginning',
        tracked: true,
      });
    }
  }
  for (const chapterName of PRESTIGE_STORY_CHAPTER_RULES[targetPrestigeLevel] || []) {
    const storyChapter = findStoryChapterByName(options.storyChapters, chapterName);
    const chapterId = storyChapter?.id || chapterName.toLowerCase().replace(/\s+/g, '-');
    const isComplete = storyChapter
      ? options.pvpProgress.storyChapters?.[storyChapter.id]?.complete === true
      : false;
    pushRow({
      currentValue: isComplete ? 'complete' : 'incomplete',
      href: storyChapter?.wikiLink,
      id: `story:${chapterId}`,
      kind: 'storyChapter',
      name: storyChapter?.name || chapterName,
      source: storyChapter ? 'overlay' : 'wiki',
      status: isComplete ? 'met' : 'unmet',
      targetPrestige: targetPrestigeLevel,
      tracked: true,
    });
  }
  for (const itemName of PRESTIGE_MANUAL_ITEM_RULES[targetPrestigeLevel] || []) {
    pushRow({
      currentValue: null,
      id: `manual-item:${targetPrestigeLevel}:${itemName}`,
      kind: 'item',
      name: itemName,
      requiredValue: 1,
      source: 'wiki',
      status: 'manual',
      targetPrestige: targetPrestigeLevel,
      tracked: false,
    });
  }
  return sortPrestigeRequirementRows(rows).map((row) => {
    if (row.kind !== 'item') return row;
    return {
      ...row,
      name: buildItemLabel(
        typeof row.requiredValue === 'number' ? row.requiredValue : undefined,
        row.name
      ),
    };
  });
};
export const summarizePrestigeRequirementRows = (
  rows: PrestigeRequirementRow[]
): PrestigeRequirementSummary => {
  const trackedRows = rows.filter((row) => row.tracked);
  const trackedMetCount = trackedRows.filter((row) => row.status === 'met').length;
  const unmetTrackedCount = trackedRows.filter((row) => row.status === 'unmet').length;
  const manualCount = rows.filter((row) => row.status === 'manual').length;
  return {
    allTrackedMet: trackedRows.length > 0 && unmetTrackedCount === 0,
    manualCount,
    trackedCount: trackedRows.length,
    trackedMetCount,
    unmetTrackedCount,
  };
};
export const parsePrestigeSummary = (value: unknown): PrestigeRunSummary => {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const toCount = (input: unknown): number => Math.max(0, toSafeInteger(input, 0));
  const toNullableTimestamp = (input: unknown): number | null => {
    if (typeof input !== 'number' || !Number.isFinite(input)) return null;
    const truncated = Math.trunc(input);
    return truncated > 0 ? truncated : null;
  };
  return {
    completedHideoutModules: toCount(raw.completedHideoutModules),
    completedHideoutParts: toCount(raw.completedHideoutParts),
    completedObjectives: toCount(raw.completedObjectives),
    completedStoryChapters: toCount(raw.completedStoryChapters),
    completedTasks: toCount(raw.completedTasks),
    failedTasks: toCount(raw.failedTasks),
    firstActionAt: toNullableTimestamp(raw.firstActionAt),
    lastActionAt: toNullableTimestamp(raw.lastActionAt),
    level: Math.max(1, toCount(raw.level)),
    prestigeLevel: clampPrestigeLevel(toCount(raw.prestigeLevel)),
  };
};
export const parsePrestigeRunRows = (
  rows: UserPrestigeRunRow[] | null | undefined
): PrestigeRunRecord[] => {
  if (!Array.isArray(rows)) return [];
  const parsed: PrestigeRunRecord[] = [];
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id) continue;
    const mode = row.mode === 'pve' ? 'pve' : 'pvp';
    const createdAt =
      typeof row.created_at === 'string' ? row.created_at : new Date().toISOString();
    const prestigeFrom = clampPrestigeLevel(toSafeInteger(row.prestige_from, 0));
    const prestigeTo = Math.max(
      1,
      clampPrestigeLevel(toSafeInteger(row.prestige_to, prestigeFrom + 1))
    );
    parsed.push({
      createdAt,
      id: row.id,
      mode,
      prestigeFrom,
      prestigeTo,
      summary: parsePrestigeSummary(row.summary),
    });
  }
  return parsed.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
};
