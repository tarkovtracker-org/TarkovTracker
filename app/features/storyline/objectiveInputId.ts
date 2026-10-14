/** DOM id of a storyline objective checkbox; deep-link focus looks rows up by it. */
export const storylineObjectiveInputId = (chapterId: string, objectiveId: string) =>
  `storyline-objective-${chapterId}-${objectiveId}`;
