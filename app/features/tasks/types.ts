export type ActionButtonState =
  'locked' | 'complete' | 'hotwheels' | 'active' | 'available' | 'none';
type TaskActionOptions = {
  isOurFaction: boolean;
  isFailed: boolean;
  isLocked: boolean;
  isComplete: boolean;
  isActive: boolean;
  showHotWheelsFail: boolean;
};
const TASK_ACTION_RULES: Array<{
  matches: (options: TaskActionOptions) => boolean;
  state: ActionButtonState;
}> = [
  { matches: ({ isOurFaction }) => !isOurFaction, state: 'none' },
  { matches: ({ isFailed }) => isFailed, state: 'complete' },
  { matches: ({ isLocked }) => isLocked, state: 'locked' },
  { matches: ({ isComplete }) => isComplete, state: 'complete' },
  {
    matches: ({ showHotWheelsFail, isActive }) => showHotWheelsFail && isActive,
    state: 'hotwheels',
  },
  { matches: ({ isActive }) => isActive, state: 'active' },
];
export const resolveTaskActionButtonState = (options: TaskActionOptions): ActionButtonState =>
  TASK_ACTION_RULES.find(({ matches }) => matches(options))?.state ?? 'available';
