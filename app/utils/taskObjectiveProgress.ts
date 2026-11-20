export const isHandoverObjective = (type: string | undefined): boolean =>
  type === 'giveItem' || type === 'giveQuestItem';
