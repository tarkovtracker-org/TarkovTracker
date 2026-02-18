const STORY_OBJECTIVE_LINKS: Record<string, string[]> = {
  'falling-skies-main-19': ['falling-skies-main-20'],
  'falling-skies-main-20': ['falling-skies-main-19'],
};
export const getDefaultStoryObjectiveLinks = (): Record<string, string[]> => {
  return Object.fromEntries(
    Object.entries(STORY_OBJECTIVE_LINKS).map(([objectiveId, linkedObjectives]) => [
      objectiveId,
      [...linkedObjectives],
    ])
  );
};
