const STORY_OBJECTIVE_LINKS: Record<string, string[]> = {
  'falling-skies-main-19': ['falling-skies-main-20'],
  'falling-skies-main-20': ['falling-skies-main-19'],
  'the-ticket-main-12': ['the-ticket-main-13'],
  'the-ticket-main-13': ['the-ticket-main-12'],
  'the-ticket-main-22': ['the-ticket-main-23'],
  'the-ticket-main-23': ['the-ticket-main-22'],
  'the-ticket-main-25': ['the-ticket-main-26'],
  'the-ticket-main-26': ['the-ticket-main-25'],
};
export const getDefaultStoryObjectiveLinks = (): Record<string, string[]> => {
  return Object.fromEntries(
    Object.entries(STORY_OBJECTIVE_LINKS).map(([objectiveId, linkedObjectives]) => [
      objectiveId,
      [...linkedObjectives],
    ])
  );
};
