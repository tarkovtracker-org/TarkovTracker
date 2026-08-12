export type ActionButtonState =
  'locked' | 'complete' | 'hotwheels' | 'active' | 'available' | 'none';
export const resolveTaskActionButtonState = (options: {
  isOurFaction: boolean;
  isFailed: boolean;
  isLocked: boolean;
  isComplete: boolean;
  isActive: boolean;
  showHotWheelsFail: boolean;
}): ActionButtonState => {
  if (!options.isOurFaction) return 'none';
  if (options.isFailed) return 'complete';
  if (options.isLocked) return 'locked';
  if (options.isComplete) return 'complete';
  if (options.showHotWheelsFail && options.isActive) return 'hotwheels';
  if (options.isActive) return 'active';
  return 'available';
};
