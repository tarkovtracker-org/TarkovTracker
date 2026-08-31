<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed inset-0 z-50">
      <template v-if="overlayPanels.length">
        <div
          v-for="(panel, index) in overlayPanels"
          :key="index"
          data-testid="page-help-overlay-panel"
          aria-hidden="true"
          class="bg-surface-950/78 pointer-events-auto absolute"
          :style="panel"
        ></div>
      </template>
      <div
        v-else
        data-testid="page-help-overlay-fallback"
        aria-hidden="true"
        class="bg-surface-950/78 pointer-events-auto absolute inset-0"
      ></div>
      <div
        v-if="highlightStyle"
        class="page-help-highlight border-primary-400/80 ring-primary-500/40 pointer-events-none fixed rounded-[28px] border shadow-2xl ring-2 transition-[top,left,width,height] duration-200 ease-out"
        :style="highlightStyle"
      ></div>
      <div
        v-if="actionHighlightStyle"
        class="border-primary-300/70 ring-primary-400/30 pointer-events-none fixed animate-pulse rounded-[28px] border-2 ring-4"
        :style="actionHighlightStyle"
      ></div>
      <div
        v-if="actionCueStyle"
        class="bg-primary-500 pointer-events-none fixed z-[1] flex -translate-x-1/2 -translate-y-full animate-bounce items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-black shadow-lg"
        :style="actionCueStyle"
      >
        <UIcon name="i-mdi-cursor-default-click-outline" class="h-4 w-4" />
        <span>{{ actionCueLabel }}</span>
      </div>
      <aside
        ref="panelRef"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-label="dialogLabel"
        :aria-labelledby="dialogLabel ? undefined : titleId"
        class="bg-surface-900/96 border-surface-700/70 pointer-events-auto fixed flex flex-col overflow-hidden rounded-[28px] border shadow-2xl backdrop-blur-sm"
        :style="panelStyle"
        @keydown="handleKeydown"
      >
        <div
          class="border-surface-700/60 flex items-start justify-between gap-3 border-b px-5 py-4"
        >
          <div class="min-w-0">
            <div
              :id="showStepTitle ? undefined : titleId"
              class="text-surface-400 text-[11px] font-semibold tracking-[0.18em] uppercase"
            >
              {{ title }}
            </div>
            <div
              v-if="showStepTitle"
              :id="titleId"
              class="text-surface-50 mt-2 text-lg font-semibold"
            >
              {{ currentStep.title }}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div
              class="text-surface-400 shrink-0 text-xs font-medium whitespace-nowrap tabular-nums"
            >
              {{ currentStepIndex + 1 }} / {{ steps.length }}
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-mdi-close"
              :aria-label="closeLabel"
              @click="emitClose"
            />
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p class="text-surface-200 text-sm leading-6">
            {{ currentStep.description }}
          </p>
          <ul v-if="currentStep.bullets?.length" class="mt-4 space-y-2.5">
            <li
              v-for="bullet in currentStep.bullets"
              :key="bullet"
              class="text-surface-300 flex items-start gap-2.5 text-sm leading-6"
            >
              <UIcon
                name="i-mdi-arrow-right-circle-outline"
                class="text-primary-400 mt-1 h-4 w-4 shrink-0"
              />
              <span>{{ bullet }}</span>
            </li>
          </ul>
          <div
            v-if="showPanelInteractionHint"
            class="border-primary-500/30 bg-primary-500/10 text-primary-100 mt-4 rounded-2xl border px-3 py-2 text-xs leading-5"
          >
            {{ currentStep.interactionHint }}
          </div>
        </div>
        <div
          class="border-surface-700/60 bg-surface-900/98 flex items-center justify-between gap-3 border-t px-4 py-3"
        >
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-mdi-arrow-left"
            :disabled="isFirstStep"
            @click="goToPreviousStep"
          >
            {{ previousLabel }}
          </UButton>
          <UButton
            :color="isLastStep ? 'success' : 'primary'"
            variant="soft"
            size="sm"
            :icon="isLastStep ? 'i-mdi-check' : 'i-mdi-arrow-right'"
            trailing
            @click="handleAdvance"
          >
            {{ isLastStep ? finishLabel : nextLabel }}
          </UButton>
        </div>
      </aside>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
  interface PageHelpSpotlightStep {
    avoidSelector?: string;
    advanceOnSelector?: string;
    bullets?: string[];
    description: string;
    interactionHint?: string;
    preferredPlacement?: 'bottom' | 'left' | 'right' | 'top';
    targetSelector: string;
    title: string;
  }
  interface Props {
    showStepTitle?: boolean;
    steps: PageHelpSpotlightStep[];
    title: string;
  }
  const props = withDefaults(defineProps<Props>(), {
    showStepTitle: true,
  });
  const emit = defineEmits<{
    close: [];
    stepChange: [index: number];
  }>();
  const VIEWPORT_MARGIN = 16;
  const PANEL_GAP = 16;
  const PANEL_MAX_WIDTH = 420;
  const PANEL_MIN_WIDTH = 320;
  const PANEL_MIN_HEIGHT = 220;
  const HIGHLIGHT_PADDING = 8;
  const { t } = useI18n({ useScope: 'global' });
  const panelRef = ref<HTMLElement | null>(null);
  const titleId = `page-help-spotlight-title-${useId()}`;
  const currentStepIndex = ref(0);
  const targetRect = ref<DOMRect | null>(null);
  const panelStyle = ref<Record<string, string>>({});
  const rafId = ref<number | null>(null);
  const pendingTimeouts = ref<number[]>([]);
  const resizeObserver = ref<ResizeObserver | null>(null);
  const scrollLockState = ref<{
    bodyOverflow: string;
    bodyOverscrollBehavior: string;
    bodyPaddingRight: string;
    htmlOverflow: string;
    htmlOverscrollBehavior: string;
  } | null>(null);
  const SCROLL_LOCK_KEYS = new Set([
    ' ',
    'ArrowDown',
    'ArrowUp',
    'End',
    'Home',
    'PageDown',
    'PageUp',
    'Spacebar',
  ]);
  const currentStep = computed<PageHelpSpotlightStep>(() => {
    return (
      props.steps[currentStepIndex.value] ?? {
        description: '',
        targetSelector: '',
        title: '',
      }
    );
  });
  const showStepTitle = computed(
    () => props.showStepTitle && currentStep.value.title.trim() !== ''
  );
  const dialogLabel = computed(() => {
    if (showStepTitle.value) return undefined;
    return currentStep.value.title ? `${props.title}: ${currentStep.value.title}` : props.title;
  });
  const closeLabel = computed(() => t('common.close'));
  const previousLabel = computed(() => t('common.previous'));
  const nextLabel = computed(() => t('common.next'));
  const finishLabel = computed(() => t('common.finish'));
  const actionCueLabel = computed(() => {
    const value = t('common.click');
    return value === 'common.click' ? 'Click' : value;
  });
  const showPanelInteractionHint = computed(() => {
    return Boolean(currentStep.value.interactionHint && !currentStep.value.advanceOnSelector);
  });
  const isFirstStep = computed(() => currentStepIndex.value === 0);
  const isLastStep = computed(() => currentStepIndex.value === props.steps.length - 1);
  const isOverlayMode = computed(() => true);
  const { restoreTriggerFocus, trapFocus } = useOverlayFocusTrap({
    containerRef: panelRef,
    isOverlayMode,
  });
  let didRestoreTriggerFocus = false;
  const clamp = (value: number, min: number, max: number) => {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
  };
  const resolveTarget = () => {
    if (!import.meta.client) return null;
    if (!currentStep.value.targetSelector) return null;
    return document.querySelector<HTMLElement>(currentStep.value.targetSelector);
  };
  const resolveAvoidRect = () => {
    if (!import.meta.client) return null;
    if (!currentStep.value.avoidSelector) return null;
    return (
      document
        .querySelector<HTMLElement>(currentStep.value.avoidSelector)
        ?.getBoundingClientRect() ?? null
    );
  };
  const intersectsRect = (
    firstRect: { bottom: number; left: number; right: number; top: number },
    secondRect: { bottom: number; left: number; right: number; top: number }
  ) =>
    firstRect.left < secondRect.right &&
    firstRect.right > secondRect.left &&
    firstRect.top < secondRect.bottom &&
    firstRect.bottom > secondRect.top;
  const updatePanelPosition = () => {
    if (!import.meta.client) return;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelWidth = Math.min(PANEL_MAX_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);
    const maxHeight = Math.max(PANEL_MIN_HEIGHT, viewportHeight - VIEWPORT_MARGIN * 2);
    const panelHeight = Math.min(
      panelRef.value?.getBoundingClientRect().height ?? PANEL_MIN_HEIGHT,
      maxHeight
    );
    const rect = targetRect.value;
    if (!rect) {
      panelStyle.value = {
        left: `${Math.max(VIEWPORT_MARGIN, (viewportWidth - panelWidth) / 2)}px`,
        maxHeight: `${maxHeight}px`,
        top: `${Math.max(VIEWPORT_MARGIN, (viewportHeight - panelHeight) / 2)}px`,
        width: `${panelWidth}px`,
      };
      return;
    }
    const avoidRect = resolveAvoidRect();
    const minSidePanelWidth = Math.min(PANEL_MIN_WIDTH, panelWidth);
    const getSidePanelWidth = (space: number) =>
      Math.min(panelWidth, Math.max(minSidePanelWidth, space - PANEL_GAP));
    const createsOverlap = (left: number, top: number, width: number) => {
      if (!avoidRect) return false;
      return intersectsRect(
        {
          bottom: top + panelHeight,
          left,
          right: left + width,
          top,
        },
        avoidRect
      );
    };
    const spaces = {
      bottom: viewportHeight - rect.bottom - VIEWPORT_MARGIN,
      left: rect.left - VIEWPORT_MARGIN,
      right: viewportWidth - rect.right - VIEWPORT_MARGIN,
      top: rect.top - VIEWPORT_MARGIN,
    } satisfies Record<'bottom' | 'left' | 'right' | 'top', number>;
    const centeredLeft = rect.left + rect.width / 2 - panelWidth / 2;
    const centeredTop = rect.top + rect.height / 2 - panelHeight / 2;
    const placementCandidates = {
      bottom: {
        width: panelWidth,
      },
      left: {
        width: getSidePanelWidth(spaces.left),
      },
      right: {
        width: getSidePanelWidth(spaces.right),
      },
      top: {
        width: panelWidth,
      },
    } satisfies Record<'bottom' | 'left' | 'right' | 'top', { width: number }>;
    const candidateStyles = {
      bottom: {
        left: clamp(
          centeredLeft,
          VIEWPORT_MARGIN,
          viewportWidth - placementCandidates.bottom.width - VIEWPORT_MARGIN
        ),
        top: clamp(
          rect.bottom + PANEL_GAP,
          VIEWPORT_MARGIN,
          viewportHeight - panelHeight - VIEWPORT_MARGIN
        ),
      },
      left: {
        left: clamp(
          rect.left - placementCandidates.left.width - PANEL_GAP,
          VIEWPORT_MARGIN,
          viewportWidth - placementCandidates.left.width - VIEWPORT_MARGIN
        ),
        top: clamp(centeredTop, VIEWPORT_MARGIN, viewportHeight - panelHeight - VIEWPORT_MARGIN),
      },
      right: {
        left: clamp(
          rect.right + PANEL_GAP,
          VIEWPORT_MARGIN,
          viewportWidth - placementCandidates.right.width - VIEWPORT_MARGIN
        ),
        top: clamp(centeredTop, VIEWPORT_MARGIN, viewportHeight - panelHeight - VIEWPORT_MARGIN),
      },
      top: {
        left: clamp(
          centeredLeft,
          VIEWPORT_MARGIN,
          viewportWidth - placementCandidates.top.width - VIEWPORT_MARGIN
        ),
        top: clamp(
          rect.top - panelHeight - PANEL_GAP,
          VIEWPORT_MARGIN,
          viewportHeight - panelHeight - VIEWPORT_MARGIN
        ),
      },
    } satisfies Record<'bottom' | 'left' | 'right' | 'top', { left: number; top: number }>;
    const placementMeta = {
      bottom: {
        fits: spaces.bottom >= panelHeight + PANEL_GAP,
        overlapsAvoid: createsOverlap(
          candidateStyles.bottom.left,
          candidateStyles.bottom.top,
          placementCandidates.bottom.width
        ),
      },
      left: {
        fits: spaces.left >= minSidePanelWidth + PANEL_GAP,
        overlapsAvoid: createsOverlap(
          candidateStyles.left.left,
          candidateStyles.left.top,
          placementCandidates.left.width
        ),
      },
      right: {
        fits: spaces.right >= minSidePanelWidth + PANEL_GAP,
        overlapsAvoid: createsOverlap(
          candidateStyles.right.left,
          candidateStyles.right.top,
          placementCandidates.right.width
        ),
      },
      top: {
        fits: spaces.top >= panelHeight + PANEL_GAP,
        overlapsAvoid: createsOverlap(
          candidateStyles.top.left,
          candidateStyles.top.top,
          placementCandidates.top.width
        ),
      },
    } satisfies Record<
      'bottom' | 'left' | 'right' | 'top',
      { fits: boolean; overlapsAvoid: boolean }
    >;
    const baseOrder: Array<'bottom' | 'left' | 'right' | 'top'> = [
      'right',
      'left',
      'bottom',
      'top',
    ];
    const placementOrder = currentStep.value.preferredPlacement
      ? [
          currentStep.value.preferredPlacement,
          ...baseOrder.filter((placement) => placement !== currentStep.value.preferredPlacement),
        ]
      : baseOrder;
    const selectedPlacement =
      placementOrder.find((placement) => {
        return placementMeta[placement].fits && !placementMeta[placement].overlapsAvoid;
      }) ??
      placementOrder.find((placement) => !placementMeta[placement].overlapsAvoid) ??
      placementOrder.find((placement) => placementMeta[placement].fits) ??
      [...placementOrder].sort((leftPlacement, rightPlacement) => {
        return spaces[rightPlacement] - spaces[leftPlacement];
      })[0] ??
      'bottom';
    panelStyle.value = {
      left: `${candidateStyles[selectedPlacement].left}px`,
      maxHeight: `${maxHeight}px`,
      top: `${candidateStyles[selectedPlacement].top}px`,
      width: `${placementCandidates[selectedPlacement].width}px`,
    };
  };
  const updateTargetRect = () => {
    if (!import.meta.client) return;
    targetRect.value = resolveTarget()?.getBoundingClientRect() ?? null;
    updatePanelPosition();
  };
  const queuePositionUpdate = () => {
    if (!import.meta.client) return;
    if (rafId.value !== null) {
      window.cancelAnimationFrame(rafId.value);
    }
    rafId.value = window.requestAnimationFrame(() => {
      updateTargetRect();
      rafId.value = null;
    });
  };
  const scheduleFollowUpPositionUpdates = () => {
    if (!import.meta.client) return;
    pendingTimeouts.value.forEach((timeoutId) => window.clearTimeout(timeoutId));
    pendingTimeouts.value = [150, 350, 700].map((delay) =>
      window.setTimeout(() => {
        queuePositionUpdate();
      }, delay)
    );
  };
  const isEventWithinPanel = (target: EventTarget | null) => {
    return target instanceof Node && panelRef.value?.contains(target);
  };
  const lockPageScroll = () => {
    if (!import.meta.client || scrollLockState.value) return;
    const { body, documentElement } = document;
    scrollLockState.value = {
      bodyOverflow: body.style.overflow,
      bodyOverscrollBehavior: body.style.overscrollBehavior,
      bodyPaddingRight: body.style.paddingRight,
      htmlOverflow: documentElement.style.overflow,
      htmlOverscrollBehavior: documentElement.style.overscrollBehavior,
    };
    const scrollbarWidth = Math.max(0, window.innerWidth - documentElement.clientWidth);
    documentElement.style.overflow = 'hidden';
    documentElement.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
  };
  const unlockPageScroll = () => {
    if (!import.meta.client || !scrollLockState.value) return;
    const { body, documentElement } = document;
    body.style.overflow = scrollLockState.value.bodyOverflow;
    body.style.overscrollBehavior = scrollLockState.value.bodyOverscrollBehavior;
    body.style.paddingRight = scrollLockState.value.bodyPaddingRight;
    documentElement.style.overflow = scrollLockState.value.htmlOverflow;
    documentElement.style.overscrollBehavior = scrollLockState.value.htmlOverscrollBehavior;
    scrollLockState.value = null;
  };
  const scrollCurrentTargetIntoView = (behavior: ScrollBehavior = 'smooth') => {
    if (!import.meta.client) return;
    const target = resolveTarget();
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const topThreshold = 96;
    const bottomThreshold = window.innerHeight - 120;
    const isWithinViewport = rect.top >= topThreshold && rect.bottom <= bottomThreshold;
    if (isWithinViewport) return;
    target.scrollIntoView({
      behavior,
      block: 'center',
      inline: 'nearest',
    });
  };
  const syncToCurrentStep = async (behavior: ScrollBehavior = 'smooth') => {
    await nextTick();
    syncObservedElements();
    scrollCurrentTargetIntoView(behavior);
    queuePositionUpdate();
    scheduleFollowUpPositionUpdates();
  };
  const syncObservedElements = () => {
    if (!import.meta.client || typeof ResizeObserver === 'undefined') return;
    if (!resizeObserver.value) {
      resizeObserver.value = new ResizeObserver(() => {
        queuePositionUpdate();
        scheduleFollowUpPositionUpdates();
      });
    }
    resizeObserver.value.disconnect();
    const elements = [resolveTarget(), panelRef.value].filter((element): element is HTMLElement =>
      Boolean(element)
    );
    elements.forEach((element) => resizeObserver.value?.observe(element));
  };
  const handleViewportResize = () => {
    queuePositionUpdate();
    scheduleFollowUpPositionUpdates();
  };
  const restoreFocusToTrigger = () => {
    if (didRestoreTriggerFocus) return;
    didRestoreTriggerFocus = true;
    restoreTriggerFocus();
  };
  const emitClose = () => {
    restoreFocusToTrigger();
    emit('close');
  };
  const advanceToNextStep = () => {
    currentStepIndex.value += 1;
  };
  const goToPreviousStep = () => {
    if (isFirstStep.value) return;
    currentStepIndex.value -= 1;
  };
  const handleAdvance = () => {
    if (isLastStep.value) {
      emitClose();
      return;
    }
    advanceToNextStep();
  };
  const handleDocumentClick = (event: MouseEvent) => {
    if (!import.meta.client) return;
    if (!currentStep.value.advanceOnSelector || isLastStep.value) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(currentStep.value.advanceOnSelector)) return;
    const stepIndex = currentStepIndex.value;
    window.setTimeout(() => {
      if (currentStepIndex.value !== stepIndex) return;
      if (!props.steps[stepIndex]?.advanceOnSelector) return;
      advanceToNextStep();
    }, 0);
  };
  const handleBlockedScroll = (event: TouchEvent | WheelEvent) => {
    if (!import.meta.client || isEventWithinPanel(event.target)) return;
    event.preventDefault();
  };
  const handleDocumentKeydown = (event: KeyboardEvent) => {
    if (!import.meta.client || isEventWithinPanel(event.target)) return;
    if (!SCROLL_LOCK_KEYS.has(event.key)) return;
    event.preventDefault();
  };
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      emitClose();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goToPreviousStep();
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      handleAdvance();
      return;
    }
    trapFocus(event);
  };
  const highlightFrame = computed(() => {
    const rect = targetRect.value;
    if (!rect || !import.meta.client) return null;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const top = Math.max(VIEWPORT_MARGIN, rect.top - HIGHLIGHT_PADDING);
    const left = Math.max(VIEWPORT_MARGIN, rect.left - HIGHLIGHT_PADDING);
    const right = Math.min(viewportWidth - VIEWPORT_MARGIN, rect.right + HIGHLIGHT_PADDING);
    const bottom = Math.min(viewportHeight - VIEWPORT_MARGIN, rect.bottom + HIGHLIGHT_PADDING);
    return {
      bottom,
      height: Math.max(48, bottom - top),
      left,
      right,
      top,
      viewportHeight,
      viewportWidth,
      width: Math.max(96, right - left),
    };
  });
  const highlightStyle = computed<Record<string, string> | null>(() => {
    const frame = highlightFrame.value;
    if (!frame) return null;
    return {
      height: `${frame.height}px`,
      left: `${frame.left}px`,
      top: `${frame.top}px`,
      width: `${frame.width}px`,
    };
  });
  const actionHighlightStyle = computed<Record<string, string> | null>(() => {
    if (!currentStep.value.advanceOnSelector) return null;
    return highlightStyle.value;
  });
  const actionCueStyle = computed<Record<string, string> | null>(() => {
    const frame = highlightFrame.value;
    if (!frame || !currentStep.value.advanceOnSelector) return null;
    return {
      left: `${frame.left + frame.width / 2}px`,
      top: `${Math.max(VIEWPORT_MARGIN + 44, frame.top - 12)}px`,
    };
  });
  const overlayPanels = computed<Record<string, string>[]>(() => {
    const frame = highlightFrame.value;
    if (!frame) return [];
    const frameRight = frame.left + frame.width;
    const frameBottom = frame.top + frame.height;
    return [
      {
        height: `${frame.top}px`,
        left: '0px',
        top: '0px',
        width: `${frame.viewportWidth}px`,
      },
      {
        height: `${frame.height}px`,
        left: '0px',
        top: `${frame.top}px`,
        width: `${frame.left}px`,
      },
      {
        height: `${frame.height}px`,
        left: `${frameRight}px`,
        top: `${frame.top}px`,
        width: `${Math.max(0, frame.viewportWidth - frameRight)}px`,
      },
      {
        height: `${Math.max(0, frame.viewportHeight - frameBottom)}px`,
        left: '0px',
        top: `${frameBottom}px`,
        width: `${frame.viewportWidth}px`,
      },
    ].filter((panel) => Number.parseFloat(panel.width) > 0 && Number.parseFloat(panel.height) > 0);
  });
  watch(
    () => currentStepIndex.value,
    () => {
      emit('stepChange', currentStepIndex.value);
      void syncToCurrentStep();
    }
  );
  onMounted(() => {
    emit('stepChange', currentStepIndex.value);
    void syncToCurrentStep('auto');
    lockPageScroll();
    document.addEventListener('click', handleDocumentClick, true);
    document.addEventListener('keydown', handleDocumentKeydown, true);
    document.addEventListener('touchmove', handleBlockedScroll, {
      capture: true,
      passive: false,
    });
    window.addEventListener('resize', handleViewportResize);
    window.visualViewport?.addEventListener('resize', handleViewportResize);
    window.addEventListener('wheel', handleBlockedScroll, {
      capture: true,
      passive: false,
    });
    window.addEventListener('scroll', queuePositionUpdate, true);
  });
  onBeforeUnmount(() => {
    if (!import.meta.client) return;
    restoreFocusToTrigger();
    document.removeEventListener('click', handleDocumentClick, true);
    document.removeEventListener('keydown', handleDocumentKeydown, true);
    document.removeEventListener('touchmove', handleBlockedScroll, true);
    window.removeEventListener('resize', handleViewportResize);
    window.visualViewport?.removeEventListener('resize', handleViewportResize);
    window.removeEventListener('wheel', handleBlockedScroll, true);
    window.removeEventListener('scroll', queuePositionUpdate, true);
    if (rafId.value !== null) {
      window.cancelAnimationFrame(rafId.value);
    }
    pendingTimeouts.value.forEach((timeoutId) => window.clearTimeout(timeoutId));
    resizeObserver.value?.disconnect();
    unlockPageScroll();
  });
</script>
