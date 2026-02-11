export const MAP_OBJECTIVE_TYPES = [
  'mark',
  'zone',
  'extract',
  'visit',
  'findItem',
  'findQuestItem',
  'plantItem',
  'plantQuestItem',
  'shoot',
  'useItem',
  'place',
] as const;
const MAP_OBJECTIVE_TYPE_SET = new Set<string>(MAP_OBJECTIVE_TYPES);
export const isMapObjectiveType = (objectiveType: string | null | undefined): boolean => {
  return objectiveType != null && MAP_OBJECTIVE_TYPE_SET.has(objectiveType);
};
