// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  focusStackWhenPopupAttached,
  restoreMapFocusAfterPopupClose,
  selectStackedObjective,
  type ObjectiveStackEntry,
} from '@/features/maps/utils/objectiveStack';
afterEach(() => {
  document.body.innerHTML = '';
});
describe('stacked objective popup interactions', () => {
  it('selects the matching popup occurrence after closing the stack', () => {
    const firstControl = { showPopup: vi.fn() };
    const selectedControl = { showPopup: vi.fn() };
    const closeCurrent = vi.fn();
    const entries: ObjectiveStackEntry[] = [
      { objectiveId: 'first', control: firstControl },
      { objectiveId: 'selected', control: selectedControl },
    ];
    selectStackedObjective(entries, 'selected', closeCurrent);
    expect(closeCurrent).toHaveBeenCalledOnce();
    expect(firstControl.showPopup).not.toHaveBeenCalled();
    expect(selectedControl.showPopup).toHaveBeenCalledWith(true);
  });
  it('closes the stack even if a requested entry no longer exists', () => {
    const closeCurrent = vi.fn();
    selectStackedObjective([], 'missing', closeCurrent);
    expect(closeCurrent).toHaveBeenCalledOnce();
  });
  it('focuses the stack immediately when its popup is already attached', () => {
    const onPopupAttach = vi.fn();
    const focusFirstEntry = vi.fn();
    focusStackWhenPopupAttached(true, onPopupAttach, () => true, focusFirstEntry);
    expect(focusFirstEntry).toHaveBeenCalledOnce();
    expect(onPopupAttach).not.toHaveBeenCalled();
  });
  it('waits for popup attachment before focusing the current stack', () => {
    const callbacks: Array<() => void> = [];
    const onPopupAttach = vi.fn((callback: () => void) => callbacks.push(callback));
    const focusFirstEntry = vi.fn();
    focusStackWhenPopupAttached(false, onPopupAttach, () => true, focusFirstEntry);
    expect(onPopupAttach).toHaveBeenCalledOnce();
    callbacks[0]?.();
    expect(focusFirstEntry).toHaveBeenCalledOnce();
    focusStackWhenPopupAttached(false, onPopupAttach, () => false, focusFirstEntry);
    callbacks[1]?.();
    expect(focusFirstEntry).toHaveBeenCalledOnce();
  });
  it('restores focus to the map only when focus is inside the popup', () => {
    const popup = document.createElement('div');
    const popupButton = document.createElement('button');
    const mapSurface = document.createElement('div');
    const unrelatedButton = document.createElement('button');
    mapSurface.tabIndex = 0;
    popup.append(popupButton);
    document.body.append(popup, mapSurface, unrelatedButton);
    popupButton.focus();
    expect(restoreMapFocusAfterPopupClose(popup, mapSurface, document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(mapSurface);
    unrelatedButton.focus();
    expect(restoreMapFocusAfterPopupClose(popup, mapSurface, document.activeElement)).toBe(false);
    expect(document.activeElement).toBe(unrelatedButton);
  });
});
