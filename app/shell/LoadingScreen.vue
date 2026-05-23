<template>
  <div
    v-if="shouldShow"
    ref="overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="loading-screen-title"
    aria-describedby="loading-screen-description"
    class="bg-surface-950 fixed inset-x-0 top-11 bottom-0 z-50 flex items-center justify-center"
  >
    <div class="flex flex-col items-center gap-6 px-4">
      <div class="relative">
        <UIcon
          v-if="!hasErrors"
          name="i-heroicons-arrow-path"
          class="text-primary-500 h-16 w-16 animate-spin"
        />
        <UIcon v-else name="i-heroicons-exclamation-triangle" class="text-warning-500 h-16 w-16" />
      </div>
      <div class="flex flex-col items-center gap-2 text-center">
        <h2
          id="loading-screen-title"
          data-loading-screen-title
          class="focus-visible:ring-primary-500 text-surface-100 focus-visible:ring-offset-surface-950 rounded-sm text-xl font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          {{ hasErrors ? $t('loading_screen.title_error') : $t('loading_screen.title') }}
        </h2>
        <p id="loading-screen-description" class="text-surface-400 text-sm">
          {{ hasErrors ? $t('loading_screen.subtitle_error') : $t('loading_screen.subtitle') }}
        </p>
      </div>
      <div v-if="!hasErrors" class="text-surface-600 mt-4 max-w-md text-center text-xs">
        {{ $t('loading_screen.first_load_info') }}
      </div>
      <div v-else class="mt-4 flex flex-col items-center gap-3">
        <p class="text-surface-500 max-w-md text-center text-xs">
          {{ $t('loading_screen.partial_data_info') }}
        </p>
        <div class="flex gap-3">
          <UButton
            color="primary"
            variant="solid"
            :disabled="isRetrying"
            :loading="isRetrying"
            @click="handleRetry"
          >
            {{ $t('loading_screen.retry') }}
          </UButton>
          <UButton color="neutral" variant="outline" :disabled="isRetrying" @click="handleContinue">
            {{ $t('loading_screen.continue_anyway') }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useMetadataStore } from '@/stores/useMetadata';
  import { logger } from '@/utils/logger';
  type InertElementState = {
    ariaHidden: string | null;
    element: Element;
    hadInert: boolean;
  };
  const metadataStore = useMetadataStore();
  const isRetrying = ref(false);
  const userDismissed = ref(false);
  const visibilityRunId = ref(0);
  const overlay = ref<HTMLElement | null>(null);
  const previousActiveElement = ref<HTMLElement | null>(null);
  const inertElements = ref<InertElementState[]>([]);
  const isLoading = computed(() => {
    if (metadataStore.hasInitialized) return false;
    return (
      metadataStore.loading ||
      metadataStore.hideoutLoading ||
      metadataStore.prestigeLoading ||
      metadataStore.editionsLoading
    );
  });
  const hasErrors = computed(() => {
    return !!(
      metadataStore.error ||
      metadataStore.hideoutError ||
      metadataStore.prestigeError ||
      metadataStore.editionsError
    );
  });
  const shouldShow = computed(() => {
    if (userDismissed.value || metadataStore.hasInitialized) return false;
    return isLoading.value || hasErrors.value;
  });
  function trapFocus(e: KeyboardEvent) {
    if (!overlay.value || e.key !== 'Tab') return;
    const focusableElements = overlay.value.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableElements.length === 0) {
      e.preventDefault();
      return;
    }
    const firstFocusable = focusableElements[0] as HTMLElement;
    const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;
    if (!overlay.value.contains(document.activeElement)) {
      firstFocusable.focus();
      e.preventDefault();
      return;
    }
    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        lastFocusable.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        firstFocusable.focus();
        e.preventDefault();
      }
    }
  }
  function setSiblingsInert(inert: boolean) {
    if (inert) {
      if (!overlay.value) return;
      const parent = overlay.value.parentElement;
      if (!parent) return;
      Array.from(parent.children).forEach((child) => {
        if (child !== overlay.value && child.nodeType === 1) {
          inertElements.value.push({
            ariaHidden: child.getAttribute('aria-hidden'),
            element: child,
            hadInert: child.hasAttribute('inert'),
          });
          child.setAttribute('inert', '');
          child.setAttribute('aria-hidden', 'true');
        }
      });
    } else {
      inertElements.value.forEach(({ element, hadInert, ariaHidden }) => {
        if (!hadInert) {
          element.removeAttribute('inert');
        }
        if (ariaHidden === null) {
          element.removeAttribute('aria-hidden');
        } else {
          element.setAttribute('aria-hidden', ariaHidden);
        }
      });
      inertElements.value = [];
    }
  }
  const handleVisibilityChange = async (isVisible: boolean) => {
    const currentRun = ++visibilityRunId.value;
    if (isVisible) {
      previousActiveElement.value =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      await nextTick();
      if (currentRun !== visibilityRunId.value || !overlay.value || !shouldShow.value) return;
      const title = overlay.value.querySelector<HTMLElement>('[data-loading-screen-title]');
      if (title) {
        title.setAttribute('tabindex', '-1');
        title.focus();
      }
      window.addEventListener('keydown', trapFocus);
      setSiblingsInert(true);
    } else {
      window.removeEventListener('keydown', trapFocus);
      setSiblingsInert(false);
      if (previousActiveElement.value && document.contains(previousActiveElement.value)) {
        previousActiveElement.value.focus();
      }
      previousActiveElement.value = null;
    }
  };
  watch(shouldShow, (newVal) => {
    void handleVisibilityChange(newVal);
  });
  onMounted(() => {
    if (shouldShow.value) {
      void handleVisibilityChange(true);
    }
  });
  onUnmounted(() => {
    visibilityRunId.value += 1;
    window.removeEventListener('keydown', trapFocus);
    setSiblingsInert(false);
  });
  async function handleRetry() {
    if (isRetrying.value) return;
    userDismissed.value = false;
    isRetrying.value = true;
    try {
      await metadataStore.initialize({ forceRefresh: true });
    } catch (error) {
      logger.error('[LoadingScreen] Metadata retry failed:', error);
    } finally {
      isRetrying.value = false;
    }
  }
  function handleContinue() {
    if (isRetrying.value) return;
    userDismissed.value = true;
  }
</script>
