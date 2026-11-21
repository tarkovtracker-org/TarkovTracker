import { useTimeoutFn } from '@vueuse/core';
import type { Ref } from '#imports';
export function useTaskCardPreview(panel: Ref<HTMLElement | null>) {
  const open = ref(false);
  let manageFocus = false;
  let restoringFocus = false;
  let keyboardFocused = false;
  const { start: startHoverClose, stop: cancelHoverClose } = useTimeoutFn(
    () => setOpen(false),
    200,
    { immediate: false }
  );
  function setOpen(next: boolean) {
    cancelHoverClose();
    if (next) manageFocus = true;
    else keyboardFocused = false;
    open.value = next;
  }
  function showPreview() {
    cancelHoverClose();
    if (open.value) return;
    manageFocus = false;
    open.value = true;
  }
  function openOnHover(event: PointerEvent) {
    if (event.pointerType === 'mouse') showPreview();
  }
  function openOnFocus(event: FocusEvent) {
    if (restoringFocus) return;
    const trigger = event.currentTarget as HTMLElement;
    keyboardFocused = trigger.matches(':focus-visible');
    if (keyboardFocused) showPreview();
  }
  function scheduleHoverClose() {
    if (open.value && !manageFocus && !keyboardFocused) startHoverClose();
  }
  function closeOnBlur() {
    keyboardFocused = false;
    scheduleHoverClose();
  }
  function preserveFocus(event: Event) {
    if (!manageFocus) event.preventDefault();
  }
  function onCloseAutoFocus(event: Event) {
    preserveFocus(event);
    // The non-modal popover focuses the trigger within its close-autofocus handler.
    restoringFocus = true;
    queueMicrotask(() => {
      restoringFocus = false;
    });
  }
  function activatePanel() {
    cancelHoverClose();
    manageFocus = true;
  }
  function keepHoverOpen(event: MouseEvent) {
    if (!open.value || manageFocus) return;
    // Activate a hover preview on the first click instead of closing it.
    event.stopImmediatePropagation();
    activatePanel();
    const focusTarget = panel.value?.querySelector('a') ?? panel.value;
    focusTarget?.focus();
  }
  function closeAfterLink() {
    // Let navigation handle focus after using a quest link.
    manageFocus = false;
    setOpen(false);
  }
  return {
    open,
    setOpen,
    openOnHover,
    openOnFocus,
    closeOnBlur,
    scheduleHoverClose,
    cancelHoverClose,
    onOpenAutoFocus: preserveFocus,
    onCloseAutoFocus,
    activatePanel,
    keepHoverOpen,
    closeAfterLink,
  };
}
