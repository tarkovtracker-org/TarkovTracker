export type ObjectivePopupControl = { showPopup: (pinned: boolean) => void };
export type ObjectiveStackEntry = {
  objectiveId: string;
  control: ObjectivePopupControl;
};
export const selectStackedObjective = (
  entries: ObjectiveStackEntry[],
  objectiveId: string,
  closeCurrent: () => void
): void => {
  const selected = entries.find((entry) => entry.objectiveId === objectiveId);
  closeCurrent();
  selected?.control.showPopup(true);
};
export const focusStackWhenPopupAttached = (
  popupIsOpen: boolean,
  onPopupAttach: (focus: () => void) => void,
  isCurrent: () => boolean,
  focusFirstEntry: () => void
): void => {
  const focusIfCurrent = () => {
    if (isCurrent()) focusFirstEntry();
  };
  if (popupIsOpen) focusIfCurrent();
  else onPopupAttach(focusIfCurrent);
};
export const restoreMapFocusAfterPopupClose = (
  popupElement: HTMLElement | null,
  mapSurface: HTMLElement | null,
  activeElement: Element | null
): boolean => {
  if (!popupElement?.contains(activeElement) || !mapSurface) return false;
  mapSurface.focus({ preventScroll: true });
  return true;
};
