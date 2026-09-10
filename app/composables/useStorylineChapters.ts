import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { normalizeStoryObjectives, orderedStoryObjectives } from '@/utils/storylineObjectives';
import type { ComputedRef } from '#imports';
import type { StoryChapter, StoryObjective, StoryRewards } from '@/types/tarkov';
export interface StorylineLinkEntry {
  id: string;
  name: string;
}
export interface StorylineChapterView {
  id: string;
  name: string;
  normalizedName: string;
  order: number;
  autoStart: boolean;
  complete: boolean;
  wikiLink: string;
  description?: string | null;
  notes?: string | null;
  rewards?: StoryRewards | null;
  requirements: StorylineLinkEntry[];
  mapUnlocks: StorylineLinkEntry[];
  traderUnlocks: StorylineLinkEntry[];
  objectives: StoryObjective[];
  objectiveMap: Record<string, StoryObjective>;
}
export interface StorylineRequirementView {
  id: string;
  label: string;
}
export interface StorylineObjectiveRouteView {
  id: string;
  label: string;
  complete: boolean;
}
export interface StorylineObjectiveUnlockView {
  estimated: boolean;
  id: string;
  label: string;
  type: 'map' | 'reward' | 'trader';
}
export interface StorylineRouteChoiceGroup {
  chosenObjectiveId: string | null;
  id: string;
  objectives: StorylineObjectiveProgress[];
}
export interface StorylineObjectiveProgress extends StoryObjective {
  complete: boolean;
  hasEstimatedUnlocks: boolean;
  unlocks: StorylineObjectiveUnlockView[];
  routeAlternatives: StorylineObjectiveRouteView[];
  routeBlockingAlternatives: StorylineObjectiveRouteView[];
  routeState: 'open' | 'chosen' | 'blocked';
}
export interface StorylineEndingView {
  id: string;
  label: string;
  objectiveId: string;
  objectiveLabel: string;
  routeBlockingAlternatives: StorylineObjectiveRouteView[];
  routeChoiceIndex: number | null;
  routeState: StorylineObjectiveProgress['routeState'];
}
export interface StorylineNormalizedChapterView extends Omit<
  StorylineChapterView,
  'objectives' | 'requirements'
> {
  endings: StorylineEndingView[];
  mainObjectiveCompleted: number;
  mainObjectiveTotal: number;
  mainObjectives: StorylineObjectiveProgress[];
  mainLinearObjectives: StorylineObjectiveProgress[];
  mainRouteChoices: StorylineRouteChoiceGroup[];
  chapterUnlocks: StorylineObjectiveUnlockView[];
  objectives: StorylineObjectiveProgress[];
  optionalObjectives: StorylineObjectiveProgress[];
  optionalLinearObjectives: StorylineObjectiveProgress[];
  optionalRouteChoices: StorylineRouteChoiceGroup[];
  requirements: StorylineRequirementView[];
}
interface UseStorylineChaptersOptions {
  chapters?: () => StoryChapter[];
  isChapterComplete?: (chapterId: string) => boolean;
  isObjectiveComplete?: (chapterId: string, objectiveId: string) => boolean;
}
const normalizeChapterRequirements = (
  chapter: StorylineChapterView
): StorylineRequirementView[] => {
  const rawRequirements = chapter.requirements as Array<
    string | { description?: string; id?: string; name?: string }
  >;
  return rawRequirements
    .map((rawRequirement, index) => {
      if (typeof rawRequirement === 'string') {
        const label = rawRequirement.trim();
        if (!label) {
          return null;
        }
        return {
          id: `${chapter.id}-requirement-${index}`,
          label,
        };
      }
      const label = rawRequirement.name?.trim() || rawRequirement.description?.trim();
      if (!label) {
        return null;
      }
      return {
        id: rawRequirement.id?.trim() || `${chapter.id}-requirement-${index}`,
        label,
      };
    })
    .filter((requirement): requirement is StorylineRequirementView => Boolean(requirement));
};
const normalizeSearchText = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
};
const matchesUnlockText = (objectiveText: string, unlockLabel: string): boolean => {
  const normalizedUnlock = normalizeSearchText(unlockLabel);
  if (!normalizedUnlock) {
    return false;
  }
  return objectiveText.includes(normalizedUnlock);
};
const parseChapterRewards = (
  chapter: StorylineChapterView
): Array<Omit<StorylineObjectiveUnlockView, 'estimated'>> => {
  const rewardDescription = chapter.rewards?.description?.trim();
  if (!rewardDescription) {
    return [];
  }
  const rewardLines = rewardDescription
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const lines = rewardLines.length > 1 ? rewardLines : [rewardDescription];
  return lines.map((line, index) => ({
    id: `${chapter.id}-reward-${index + 1}`,
    label: line,
    type: 'reward',
  }));
};
const assignChapterUnlocks = (
  chapter: StorylineChapterView,
  matchObjectives: StorylineObjectiveProgress[],
  distributionObjectives: StorylineObjectiveProgress[]
): {
  chapterUnlocks: StorylineObjectiveUnlockView[];
  objectiveUnlockMap: Map<string, StorylineObjectiveUnlockView[]>;
} => {
  const chapterUnlockItems: Array<Omit<StorylineObjectiveUnlockView, 'estimated'>> = [
    ...chapter.mapUnlocks.map((map) => ({ id: map.id, label: map.name, type: 'map' as const })),
    ...chapter.traderUnlocks.map((trader) => ({
      id: trader.id,
      label: trader.name,
      type: 'trader' as const,
    })),
    ...parseChapterRewards(chapter),
  ];
  const objectiveUnlockMap = new Map<string, StorylineObjectiveUnlockView[]>(
    matchObjectives.map((objective) => [objective.id, []])
  );
  if (!chapterUnlockItems.length) {
    return {
      chapterUnlocks: [],
      objectiveUnlockMap,
    };
  }
  if (!matchObjectives.length) {
    return {
      chapterUnlocks: chapterUnlockItems.map((unlock) => ({ ...unlock, estimated: false })),
      objectiveUnlockMap,
    };
  }
  const objectiveTextById = new Map(
    matchObjectives.map((objective) => [
      objective.id,
      normalizeSearchText(`${objective.description} ${objective.notes ?? ''}`),
    ])
  );
  const unassignedUnlockItems: Array<Omit<StorylineObjectiveUnlockView, 'estimated'>> = [];
  for (const unlockItem of chapterUnlockItems) {
    const matchedObjective = matchObjectives.find((objective) =>
      matchesUnlockText(objectiveTextById.get(objective.id) ?? '', unlockItem.label)
    );
    if (!matchedObjective) {
      unassignedUnlockItems.push(unlockItem);
      continue;
    }
    objectiveUnlockMap.set(matchedObjective.id, [
      ...(objectiveUnlockMap.get(matchedObjective.id) ?? []),
      {
        ...unlockItem,
        estimated: false,
      },
    ]);
  }
  if (unassignedUnlockItems.length) {
    const fallbackObjectives =
      distributionObjectives.length > 0 ? distributionObjectives : matchObjectives;
    unassignedUnlockItems.forEach((unlockItem, index) => {
      const targetIndex = Math.min(
        fallbackObjectives.length - 1,
        Math.floor((index * fallbackObjectives.length) / unassignedUnlockItems.length)
      );
      const objectiveId = fallbackObjectives[targetIndex]?.id;
      if (!objectiveId) {
        return;
      }
      objectiveUnlockMap.set(objectiveId, [
        ...(objectiveUnlockMap.get(objectiveId) ?? []),
        {
          ...unlockItem,
          estimated: true,
        },
      ]);
    });
  }
  return {
    chapterUnlocks: [],
    objectiveUnlockMap,
  };
};
const buildRouteChoiceGroups = (
  objectives: StorylineObjectiveProgress[]
): {
  linearObjectives: StorylineObjectiveProgress[];
  routeChoiceGroups: StorylineRouteChoiceGroup[];
} => {
  const objectiveById = new Map(objectives.map((objective) => [objective.id, objective]));
  const groupedObjectiveIds = new Set<string>();
  const visited = new Set<string>();
  const routeChoiceGroups: StorylineRouteChoiceGroup[] = [];
  for (const objective of objectives) {
    if (visited.has(objective.id)) {
      continue;
    }
    const linkedIds = objective.mutuallyExclusiveWith ?? [];
    if (linkedIds.length === 0) {
      continue;
    }
    const stack = [objective.id];
    const componentIds = new Set<string>();
    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (componentIds.has(currentId)) {
        continue;
      }
      componentIds.add(currentId);
      visited.add(currentId);
      const currentObjective = objectiveById.get(currentId);
      if (!currentObjective) {
        continue;
      }
      for (const nextId of currentObjective.mutuallyExclusiveWith ?? []) {
        if (objectiveById.has(nextId) && !componentIds.has(nextId)) {
          stack.push(nextId);
        }
      }
    }
    if (componentIds.size < 2) {
      continue;
    }
    const groupedObjectives = Array.from(componentIds)
      .map((objectiveId) => objectiveById.get(objectiveId))
      .filter((value): value is StorylineObjectiveProgress => Boolean(value))
      .sort((left, right) => {
        if (left.order !== right.order) {
          return left.order - right.order;
        }
        return left.id.localeCompare(right.id);
      });
    if (groupedObjectives.length < 2) {
      continue;
    }
    groupedObjectives.forEach((groupedObjective) => {
      groupedObjectiveIds.add(groupedObjective.id);
    });
    routeChoiceGroups.push({
      chosenObjectiveId:
        groupedObjectives.find((groupedObjective) => groupedObjective.complete)?.id ?? null,
      id: `${groupedObjectives[0]!.id}-route-choice`,
      objectives: groupedObjectives,
    });
  }
  routeChoiceGroups.sort((left, right) => {
    const leftOrder = Math.min(...left.objectives.map((objective) => objective.order));
    const rightOrder = Math.min(...right.objectives.map((objective) => objective.order));
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.id.localeCompare(right.id);
  });
  const linearObjectives = objectives.filter((objective) => !groupedObjectiveIds.has(objective.id));
  return {
    linearObjectives,
    routeChoiceGroups,
  };
};
const extractEndingName = (value?: string | null): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }
  const explicitMatch = normalized.match(/^([^:;-]+?)\s+ending\b(?:\s*[:;-].*)?$/i);
  const endingName = explicitMatch?.[1]?.trim();
  if (!endingName) {
    return null;
  }
  if (/\bleads?\s+to\b/i.test(endingName)) {
    return null;
  }
  return endingName;
};
const formatEndingLabel = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Ending';
  }
  if (/\bending\b/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed} Ending`;
};
const buildStoryEndings = (
  objectives: StorylineObjectiveProgress[],
  routeChoices: StorylineRouteChoiceGroup[]
): StorylineEndingView[] => {
  if (!objectives.length || !routeChoices.length) {
    return [];
  }
  const routeChoiceIndexByObjectiveId = new Map<string, number>();
  routeChoices.forEach((routeChoice, routeChoiceIndex) => {
    routeChoice.objectives.forEach((objective) => {
      routeChoiceIndexByObjectiveId.set(objective.id, routeChoiceIndex + 1);
    });
  });
  const endings = objectives.flatMap((objective) => {
    const endingName =
      extractEndingName(objective.notes) ?? extractEndingName(objective.description);
    if (!endingName) {
      return [];
    }
    if (!routeChoiceIndexByObjectiveId.has(objective.id)) {
      return [];
    }
    if (objective.routeAlternatives.length === 0) {
      return [];
    }
    return [
      {
        id: `${objective.id}-ending`,
        label: formatEndingLabel(endingName),
        objectiveId: objective.id,
        objectiveLabel: objective.description,
        routeBlockingAlternatives: objective.routeBlockingAlternatives,
        routeChoiceIndex: routeChoiceIndexByObjectiveId.get(objective.id) ?? null,
        routeState: objective.routeState,
      },
    ];
  });
  return endings;
};
export function useStorylineChapters(options: UseStorylineChaptersOptions = {}): {
  chapters: ComputedRef<StorylineChapterView[]>;
  normalizedChapters: ComputedRef<StorylineNormalizedChapterView[]>;
} {
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const isChapterComplete = options.isChapterComplete ?? tarkovStore.isStoryChapterComplete;
  const isObjectiveComplete = options.isObjectiveComplete ?? tarkovStore.isStoryObjectiveComplete;
  const chapters = computed<StorylineChapterView[]>(() => {
    return (options.chapters?.() ?? metadataStore.storyChapters ?? []).map((chapter) => {
      const objectiveMap = normalizeStoryObjectives(chapter.objectives);
      return {
        id: chapter.id,
        name: chapter.name || chapter.id,
        normalizedName: chapter.normalizedName,
        order: chapter.order,
        autoStart: chapter.autoStart ?? false,
        complete: isChapterComplete(chapter.id),
        wikiLink: chapter.wikiLink,
        description: chapter.description,
        notes: chapter.notes,
        rewards: chapter.rewards,
        requirements: chapter.chapterRequirements ?? [],
        mapUnlocks: chapter.mapUnlocks ?? [],
        traderUnlocks: chapter.traderUnlocks ?? [],
        objectives: orderedStoryObjectives(objectiveMap),
        objectiveMap,
      };
    });
  });
  const normalizedChapters = computed<StorylineNormalizedChapterView[]>(() => {
    return chapters.value.map((chapter) => {
      const objectiveProgress = chapter.objectives.map((objective) => ({
        ...objective,
        complete: isObjectiveComplete(chapter.id, objective.id),
      }));
      const objectiveCompleteMap = new Map(
        objectiveProgress.map((objective) => [objective.id, objective.complete])
      );
      const baseObjectives: StorylineObjectiveProgress[] = objectiveProgress.map((objective) => {
        const routeAlternatives: StorylineObjectiveRouteView[] = (
          objective.mutuallyExclusiveWith ?? []
        )
          .map((linkedId) => {
            const linkedObjective = chapter.objectiveMap[linkedId];
            if (!linkedObjective) {
              return null;
            }
            return {
              id: linkedId,
              label: linkedObjective.description,
              complete: objectiveCompleteMap.get(linkedId) === true,
            };
          })
          .filter((linkedObjective): linkedObjective is StorylineObjectiveRouteView =>
            Boolean(linkedObjective)
          );
        const routeBlockingAlternatives = routeAlternatives.filter(
          (linkedObjective) => linkedObjective.complete
        );
        const routeState: StorylineObjectiveProgress['routeState'] = objective.complete
          ? 'chosen'
          : routeBlockingAlternatives.length > 0
            ? 'blocked'
            : 'open';
        return {
          ...objective,
          hasEstimatedUnlocks: false,
          unlocks: [],
          routeAlternatives,
          routeBlockingAlternatives,
          routeState,
        };
      });
      const unlockDistributionObjectives = baseObjectives.filter(
        (objective) => objective.type === 'main'
      );
      const { chapterUnlocks, objectiveUnlockMap } = assignChapterUnlocks(
        chapter,
        baseObjectives,
        unlockDistributionObjectives.length > 0 ? unlockDistributionObjectives : baseObjectives
      );
      const objectives: StorylineObjectiveProgress[] = baseObjectives.map((objective) => {
        const unlocks = objectiveUnlockMap.get(objective.id) ?? [];
        return {
          ...objective,
          hasEstimatedUnlocks: unlocks.some((unlock) => unlock.estimated),
          unlocks,
        };
      });
      const mainObjectives = objectives.filter((objective) => objective.type === 'main');
      const optionalObjectives = objectives.filter((objective) => objective.type === 'optional');
      const { linearObjectives: mainLinearObjectives, routeChoiceGroups: mainRouteChoices } =
        buildRouteChoiceGroups(mainObjectives);
      const {
        linearObjectives: optionalLinearObjectives,
        routeChoiceGroups: optionalRouteChoices,
      } = buildRouteChoiceGroups(optionalObjectives);
      const endings = buildStoryEndings(objectives, [...mainRouteChoices, ...optionalRouteChoices]);
      return {
        ...chapter,
        endings,
        mainObjectiveCompleted: mainObjectives.filter((objective) => objective.complete).length,
        mainObjectiveTotal: mainObjectives.length,
        mainLinearObjectives,
        mainObjectives,
        mainRouteChoices,
        chapterUnlocks,
        objectives,
        optionalLinearObjectives,
        optionalObjectives,
        optionalRouteChoices,
        requirements: normalizeChapterRequirements(chapter),
      };
    });
  });
  return {
    chapters,
    normalizedChapters,
  };
}
