<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible"
        ref="menuRef"
        role="menu"
        tabindex="-1"
        class="context-menu border-border bg-panel shadow-elevated fixed z-9999 min-w-45 overflow-hidden rounded-lg border"
        :style="{ top: `${y}px`, left: `${x}px` }"
        @click.stop
        @keydown="handleMenuKeydown"
      >
        <slot :close="close" />
      </div>
    </Transition>
  </Teleport>
</template>
<script setup lang="ts">
  import { onClickOutside } from '@vueuse/core';
  const visible = ref(false);
  const x = ref(0);
  const y = ref(0);
  const menuRef = ref<HTMLElement>();
  const triggerRef = ref<HTMLElement | null>(null);
  const getMenuItems = (): HTMLElement[] => {
    if (!menuRef.value) return [];
    const candidates = Array.from(
      menuRef.value.querySelectorAll('[role="menuitem"], button, a, [tabindex]')
    ) as HTMLElement[];
    return candidates.filter(
      (el) =>
        !el.hasAttribute('disabled') && !(el as HTMLButtonElement).disabled && el.tabIndex >= 0
    );
  };
  const focusFirstItem = () => {
    nextTick(() => {
      const items = getMenuItems();
      if (items.length > 0) {
        items[0]?.focus();
      } else {
        menuRef.value?.focus();
      }
    });
  };
  const close = () => {
    visible.value = false;
  };
  const closeMenu = () => {
    close();
    nextTick(() => {
      triggerRef.value?.focus();
    });
  };
  const handleMenuKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }
    const items = getMenuItems();
    if (!items.length) return;
    const currentIndex = items.findIndex((item) => item === document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      items[nextIndex]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      items[prevIndex]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  };
  const open = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget instanceof HTMLElement) {
      triggerRef.value = event.currentTarget;
    } else if (event.target instanceof HTMLElement) {
      triggerRef.value = event.target;
    } else {
      triggerRef.value = null;
    }
    x.value = event.clientX;
    y.value = event.clientY;
    visible.value = true;
    nextTick(() => {
      if (menuRef.value) {
        const rect = menuRef.value.getBoundingClientRect();
        const padding = 8;
        if (rect.right > window.innerWidth - padding) {
          x.value = Math.max(padding, window.innerWidth - rect.width - padding);
        }
        if (rect.bottom > window.innerHeight - padding) {
          y.value = Math.max(padding, window.innerHeight - rect.height - padding);
        }
        if (x.value < padding) x.value = padding;
        if (y.value < padding) y.value = padding;
      }
    });
  };
  watch(visible, (isVisible) => {
    if (isVisible) {
      focusFirstItem();
    }
  });
  onClickOutside(menuRef, closeMenu);
  const handleGlobalKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && visible.value) {
      event.preventDefault();
      closeMenu();
    }
  };
  onMounted(() => {
    document.addEventListener('keydown', handleGlobalKeydown);
  });
  onUnmounted(() => {
    document.removeEventListener('keydown', handleGlobalKeydown);
  });
  defineExpose({ open, close });
</script>
