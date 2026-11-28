<template>
  <UModal
    :open="true"
    :title="dialogTitle"
    :description="dialogDescription"
    :dismissible="!saving"
    :ui="{ content: modalContent }"
    @update:open="close"
  >
    <template #content>
      <div
        class="bg-surface-900 border-surface-700 pointer-events-auto relative flex h-dvh w-full flex-col overflow-hidden sm:h-[min(92dvh,60rem)] sm:rounded-lg sm:border sm:shadow-xl"
        @dragenter.prevent="dragEnter"
        @dragover.prevent
        @dragleave="dragLeave"
        @drop.prevent="drop"
      >
        <header class="flex items-start gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
          <UIcon
            name="i-mdi-image-search-outline"
            class="text-primary-300 mt-0.5 size-6 shrink-0"
          />
          <div class="min-w-0 flex-1">
            <h2 class="text-surface-50 text-base font-semibold sm:text-lg">
              {{ dialogTitle }}
            </h2>
            <p class="text-surface-400 text-xs sm:text-sm">
              {{ destination }}
            </p>
          </div>
          <UButton
            v-if="stream"
            size="sm"
            icon="i-mdi-stop-circle-outline"
            variant="soft"
            color="neutral"
            :aria-label="$t('stash_import.window_stop')"
            @click="stopSharing"
          >
            <span class="hidden sm:inline">{{ $t('stash_import.window_stop') }}</span>
          </UButton>
          <UButton
            icon="i-mdi-close"
            variant="ghost"
            color="neutral"
            :disabled="saving"
            :aria-label="$t('common.close')"
            @click="close(false)"
          />
        </header>
        <div v-if="!windowScan" class="border-b border-white/10 px-4 py-2.5 sm:px-5">
          <StashImportSteps :current="step" />
        </div>
        <div
          ref="body"
          tabindex="-1"
          class="min-h-0 flex-1 overflow-y-auto px-4 py-4 outline-none sm:px-5"
          :inert="bodyInert"
        >
          <div v-if="banner" class="mb-4">
            <UAlert
              :role="banner.role"
              :color="banner.color"
              variant="subtle"
              :icon="banner.icon"
              :description="$t(banner.text)"
            />
          </div>
          <p
            v-if="showReviewProgress"
            role="status"
            class="text-surface-200 mb-3 flex items-center gap-2 text-sm"
          >
            <UIcon name="i-mdi-loading" class="size-4 animate-spin" aria-hidden="true" />
            {{ $t(`stash_import.stage_${stage}`) }}
          </p>
          <StashImportIntake
            v-if="showScreenshotIntake"
            :busy="busy"
            :disabled="!canIntake"
            :dragging="dragging"
            :stage="stage"
            :completed="completed"
            :total="total"
            :demo-loading="Boolean(demoController)"
            @files="intake"
            @demo="useDemo"
            @paste-request="pasteFromClipboard"
            @cancel="cancel"
          />
          <StashWindowIntake
            v-else-if="step === 'intake'"
            :stream="stream"
            :error="captureError"
            :requesting="requesting"
            :scanning="scanningWindow"
            @share="share"
            @scan="scanWindow"
          />
          <div
            v-else-if="step === 'review'"
            class="grid gap-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]"
            :class="{ 'opacity-60': busy }"
            :inert="reviewInert"
            :aria-busy="busy"
          >
            <div class="flex min-h-0 min-w-0 flex-col gap-3">
              <StashSellAdvice
                :groups="sellAdvice.groups.value"
                :ready="sellAdvice.ready.value"
                :incomplete-tasks="sellAdvice.incompleteTasks.value"
                :mode-label="modeLabel"
                :bitmap="bitmap"
              />
              <StashScreenshot
                :bitmap="bitmap"
                :image-error="bitmapFailed"
                :width="width"
                :height="height"
                :rows="rows"
                :tracked="trackedItemIds"
                :active="active"
                @select="activeKey = $event"
                @region="pendingRegion = $event"
                @rescan="rescan"
              />
              <StashRegionEditor
                v-if="pendingRegion"
                v-model="pendingRegion"
                :width="width"
                :height="height"
                @apply="applyRegion"
                @cancel="pendingRegion = undefined"
              />
            </div>
            <StashImportReview
              v-if="result"
              v-model:active-key="activeKey"
              :result="result"
              :rows="rows"
              :tracked="trackedItemIds"
              :remaining="remaining"
              :bitmap="bitmap"
              :item-name="itemName"
              :image-for="importer.itemImages"
              @next="next"
              @split="split"
              @change="updateActive"
              @mark-fir="markAllFir"
            />
          </div>
          <StashImportApply
            v-else-if="applyData"
            v-model:import-mode="importMode"
            v-model:selected="selected"
            v-model:allow-decreases="allowDecreases"
            :targets="availableTargets"
            :totals="applyData.totals"
            :estimates="applyData.estimates"
            :relevant="applyData.relevant"
            :item-name="itemName"
            :thumb-for="thumbFor"
            :bitmap="bitmap"
            :locked="applyLocked"
          />
          <div
            v-else-if="step === 'done'"
            role="status"
            class="mx-auto flex max-w-md flex-col items-center gap-3 py-10 text-center"
          >
            <UIcon :name="done.icon" class="size-14" :class="done.tone" />
            <p class="text-surface-50 text-lg font-semibold">{{ done.title }}</p>
            <p class="text-surface-300 text-sm">{{ $t('stash_import.saved_detail') }}</p>
          </div>
        </div>
        <StashImportFooter v-bind="footer" />
        <div
          v-if="dropOverlay"
          class="bg-surface-950/85 border-primary-400 pointer-events-none absolute inset-2 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed"
        >
          <UIcon name="i-mdi-tray-arrow-down" class="text-primary-300 size-12" />
          <p class="text-surface-50 font-semibold">{{ $t('stash_import.drop_replace') }}</p>
        </div>
      </div>
    </template>
  </UModal>
</template>
<script setup lang="ts">
  import StashImportApply from '@/features/stash-import/StashImportApply.vue';
  import StashImportFooter, {
    type FooterAction,
  } from '@/features/stash-import/StashImportFooter.vue';
  import StashImportIntake from '@/features/stash-import/StashImportIntake.vue';
  import StashImportReview from '@/features/stash-import/StashImportReview.vue';
  import StashImportSteps from '@/features/stash-import/StashImportSteps.vue';
  import StashRegionEditor from '@/features/stash-import/StashRegionEditor.vue';
  import StashScreenshot from '@/features/stash-import/StashScreenshot.vue';
  import StashSellAdvice from '@/features/stash-import/StashSellAdvice.vue';
  import StashWindowIntake from '@/features/stash-import/StashWindowIntake.vue';
  import { useScreenshotBitmap } from '@/features/stash-import/useScreenshotBitmap';
  import {
    useStashImport,
    type ImportChange,
    type ImportMode,
    type StashImportPreview as PreviewData,
  } from '@/features/stash-import/useStashImport';
  import { useStashScanSession } from '@/features/stash-import/useStashScanSession';
  import { useStashSellAdvice } from '@/features/stash-import/useStashSellAdvice';
  import { useStashWindowCapture } from '@/features/stash-import/useStashWindowCapture';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { reviewedTotals } from '@/utils/stashScan/review';
  import { scanError } from '@/utils/stashScan/types';
  import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
  import type { ReviewedCell, ScanRect } from '@/utils/stashScan/types';
  type Step = 'intake' | 'review' | 'apply' | 'done';
  /** Full screen on phones; a large fixed-height panel from the sm breakpoint. */
  const modalContent =
    'pointer-events-none inset-auto top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-none max-h-none rounded-none bg-transparent p-0 shadow-none ring-0 divide-y-0 sm:w-[calc(100vw-2rem)] sm:max-w-6xl';
  const props = defineProps<{
    needs: (NeededItemTaskObjective | NeededItemHideoutModule)[];
    windowScan?: boolean;
  }>();
  const emit = defineEmits<{ close: [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const store = useTarkovStore();
  const importer = useStashImport(() => props.needs);
  const trackedItemIds = importer.trackedItemIds;
  const tracked = () => trackedItemIds.value;
  const {
    clear,
    source,
    result,
    rows,
    activeKey,
    active,
    image,
    width,
    height,
    busy,
    error,
    stage,
    completed,
    total,
    remaining,
    select,
    cancel,
    rescan,
    region,
    split,
    next,
  } = useStashScanSession();
  const {
    stream,
    requesting,
    error: captureError,
    share,
    stop: stopSharing,
    frame,
  } = useStashWindowCapture();
  const scanningWindow = ref(false);
  // Decode for display only once the worker has finished, so the two decodes never overlap.
  const { bitmap, failed: bitmapFailed } = useScreenshotBitmap(() =>
    result.value ? image.value : undefined
  );
  const step = ref<Step>('intake');
  const showReviewProgress = computed(() => step.value === 'review' && busy.value);
  const showScreenshotIntake = computed(
    () => step.value === 'intake' && (!props.windowScan || busy.value)
  );
  const demoMode = ref(false);
  const demoController = shallowRef<AbortController>();
  const importMode = ref<ImportMode>('replace');
  const selected = ref<string[]>([]);
  const preview = shallowRef<PreviewData>();
  const saving = ref(false);
  const uncertain = ref(false);
  const conflicted = ref(false);
  /** The server refuses this screenshot for good (imported before a progress reset). */
  const blockedSource = ref(false);
  let selectionInitialized = false;
  const finished = ref('');
  const importError = ref('');
  const notice = ref('');
  const dragging = ref(false);
  let dragDepth = 0;
  // Scan errors belong to the screenshot steps; save errors must never be hidden behind them.
  const displayError = computed(() =>
    ['intake', 'review'].includes(step.value) ? error.value || importError.value : importError.value
  );
  const canIntake = computed(() => !props.windowScan && !saving.value && step.value !== 'apply');
  const applyLocked = computed(
    () => saving.value || uncertain.value || conflicted.value || blockedSource.value
  );
  const modeLabels = { pvp: 'common.pvp', pve: 'common.pve', seasonal: 'common.seasonal_pvp' };
  const modeLabel = computed(() => t(modeLabels[store.currentGameMode]));
  const dialogTitle = computed(() =>
    t(props.windowScan ? 'stash_import.window_title' : 'stash_import.title')
  );
  const dialogDescription = computed(() =>
    t(props.windowScan ? 'stash_import.window_hint' : 'stash_import.description')
  );
  const destination = computed(() => {
    if (props.windowScan) return t('stash_import.window_destination', { mode: modeLabel.value });
    if (demoMode.value) return t('stash_import.demo_destination');
    return t('stash_import.destination', { mode: modeLabel.value });
  });
  const allowDecreases = ref(false);
  const pendingRegion = ref<ScanRect>();
  const sellAdvice = useStashSellAdvice(rows, result);
  const totals = computed(() => {
    if (props.windowScan) return undefined;
    try {
      return reviewedTotals(rows.value, tracked());
    } catch {
      return undefined;
    }
  });
  const availableTargets = computed(() => importer.targets(totals.value ?? []));
  const targetKeys = computed(() => availableTargets.value.map((target) => target.key).join('|'));
  function syncSelection() {
    if (!totals.value) return;
    reconcileSelection();
  }
  function reconcileSelection() {
    const keys = availableTargets.value.map((target) => target.key);
    if (!selectionInitialized && keys.length) {
      selected.value = keys;
      selectionInitialized = true;
      return;
    }
    selected.value = selected.value.filter((key) => keys.includes(key));
  }
  watch([targetKeys, () => Boolean(totals.value)], syncSelection, { immediate: true });
  const estimates = computed(() => {
    if (!totals.value) return undefined;
    return {
      add: importer.estimate(totals.value, selected.value, 'add'),
      replace: importer.estimate(totals.value, selected.value, 'replace'),
    };
  });
  const liveChanges = computed<ImportChange[]>(
    () => estimates.value?.[importMode.value].changes ?? []
  );
  const decreasing = computed(() =>
    liveChanges.value.filter((change) => change.count < change.before)
  );
  const decreaseCount = computed(() => decreasing.value.length);
  const decreaseSignature = computed(() =>
    JSON.stringify([
      importMode.value,
      decreasing.value.map(({ type, id, before, count }) => [type, id, before, count]),
    ])
  );
  // An acknowledgement covers exactly the decreases it was given for, never different numbers.
  watch(decreaseSignature, () => {
    allowDecreases.value = false;
  });
  /** Change keys that would update if every requirement were selected, for stable row lists. */
  const relevantKeys = computed(() => {
    if (!totals.value) return new Set<string>();
    const all = availableTargets.value.map((target) => target.key);
    const plan = importer.estimate(totals.value, all, importMode.value);
    return new Set(plan.changes.map((change) => `${change.type}:${change.id}`));
  });
  const canContinue = computed(
    () => !props.windowScan && !busy.value && remaining.value === 0 && Boolean(totals.value)
  );
  const reviewHint = computed(() => {
    if (remaining.value) return t('stash_import.review_first', { count: remaining.value });
    if (!totals.value) return t('stash_import.errors.quantity');
    return t('stash_import.ready_to_continue');
  });
  const reviewHintTone = computed(() =>
    remaining.value || !totals.value ? 'text-warning-300' : 'text-surface-400'
  );
  const canSave = computed(
    () =>
      !props.windowScan &&
      importer.signedIn.value &&
      liveChanges.value.length > 0 &&
      (decreaseCount.value === 0 || allowDecreases.value) &&
      !applyLocked.value &&
      !demoMode.value
  );
  const applyHint = computed(() => {
    if (demoMode.value) return t('stash_import.demo_no_save');
    if (!importer.signedIn.value) return t('stash_import.errors.sign_in');
    if (!liveChanges.value.length) return t('stash_import.no_changes');
    if (decreaseCount.value && !allowDecreases.value) return t('stash_import.confirm_first');
    return '';
  });
  const applyHintTone = computed(() =>
    importer.signedIn.value ? 'text-surface-400' : 'text-warning-300'
  );
  const done = computed(() => {
    if (finished.value === 'duplicate')
      return {
        icon: 'i-mdi-information-outline',
        tone: 'text-info-400',
        title: t('stash_import.already_imported'),
      };
    const count = preview.value?.changes.length ?? 0;
    const title = t(`stash_import.saved_${preview.value?.importMode ?? 'replace'}`, { count });
    return { icon: 'i-mdi-check-circle', tone: 'text-success-400', title };
  });
  const banner = computed(() => {
    if (displayError.value)
      return {
        role: 'alert',
        color: 'error' as const,
        icon: 'i-mdi-alert-circle-outline',
        text: displayError.value,
      };
    if (!notice.value) return undefined;
    return {
      role: 'status',
      color: 'info' as const,
      icon: 'i-mdi-information-outline',
      text: notice.value,
    };
  });
  function intakeFooter() {
    return {
      hint: props.windowScan ? undefined : t('stash_import.local_notice'),
      hintTone: 'text-surface-400',
      primary: { label: t('common.close'), variant: 'ghost' as const, run: () => close(false) },
    };
  }
  function reviewFooter() {
    if (props.windowScan) {
      return {
        hint: t('stash_import.window_review'),
        hintTone: 'text-surface-400',
        primary: {
          label: t('stash_import.window_another'),
          icon: 'i-mdi-monitor-eye',
          disabled: busy.value,
          run: guarded(startOver),
        },
      };
    }
    return {
      back: {
        label: t('stash_import.other_image'),
        icon: 'i-mdi-arrow-left',
        disabled: busy.value,
        run: guarded(startOver),
      },
      hint: reviewHint.value,
      hintTone: reviewHintTone.value,
      primary: {
        label: t('stash_import.continue'),
        trailingIcon: 'i-mdi-arrow-right',
        testid: 'stash-continue',
        disabled: !canContinue.value,
        run: guarded(goToApply),
      },
    };
  }
  function savePrimary(): FooterAction {
    return {
      label: t(`stash_import.apply_${importMode.value}`, { count: liveChanges.value.length }),
      icon: importMode.value === 'add' ? 'i-mdi-plus' : 'i-mdi-content-save-outline',
      testid: 'stash-save',
      loading: saving.value,
      disabled: !canSave.value,
      run: guarded(save),
    };
  }
  function applyPrimary(): FooterAction {
    if (uncertain.value)
      return {
        label: t('stash_import.check_receipt'),
        icon: 'i-mdi-cloud-search-outline',
        testid: 'stash-check-receipt',
        loading: saving.value,
        run: checkReceipt,
      };
    if (conflicted.value)
      return {
        label: t('stash_import.refresh_progress'),
        icon: 'i-mdi-refresh',
        loading: saving.value,
        run: reconcileConflict,
      };
    return savePrimary();
  }
  function applyFooter() {
    return {
      back: {
        label: t('stash_import.back'),
        icon: 'i-mdi-arrow-left',
        disabled: saving.value,
        run: guarded(backToReview),
      },
      hint: applyHint.value,
      hintTone: applyHintTone.value,
      primary: applyPrimary(),
    };
  }
  function doneFooter() {
    return {
      back: {
        label: t('stash_import.import_another'),
        icon: 'i-mdi-image-plus-outline',
        run: guarded(startOver),
      },
      primary: { label: t('common.close'), run: guarded(() => emit('close')) },
    };
  }
  const footers = {
    intake: intakeFooter,
    review: reviewFooter,
    apply: applyFooter,
    done: doneFooter,
  };
  const footer = computed(() => footers[step.value]());
  const applyData = computed(() => {
    if (step.value !== 'apply' || !totals.value || !estimates.value) return undefined;
    return { totals: totals.value, estimates: estimates.value, relevant: relevantKeys.value };
  });
  const dropOverlay = computed(() => dragging.value && canIntake.value && step.value !== 'intake');
  const bodyInert = computed(() => saving.value || undefined);
  // A rescan, redraw or split replaces the rows; edits made meanwhile would be lost.
  const reviewInert = computed(() => busy.value || undefined);
  /**
   * Footer buttons keep their position across steps. Ignore activations right after a step
   * change, so a double-click on Continue cannot save and a double-click on Back cannot
   * discard the review. Focus moves to the new step, so a repeated Enter does nothing.
   */
  const STEP_SETTLE_MS = 400;
  const body = useTemplateRef<HTMLElement>('body');
  let stepChangedAt = 0;
  watch(step, async () => {
    stepChangedAt = Date.now();
    await nextTick();
    body.value?.focus({ preventScroll: true });
    body.value?.scrollTo?.({ top: 0 });
  });
  function guarded(action: () => unknown) {
    return () => (Date.now() - stepChangedAt < STEP_SETTLE_MS ? undefined : action());
  }
  function itemName(id: string) {
    return (
      result.value?.catalog.items.find((item) => item.id === id)?.name ??
      t('stash_import.unidentified')
    );
  }
  function thumbFor(itemId: string) {
    return rows.value.find((row) => !row.excluded && row.itemId === itemId)?.cell;
  }
  function close(open: boolean) {
    if (!open && !saving.value) emit('close');
  }
  function resetImport() {
    preview.value = undefined;
    uncertain.value = false;
    conflicted.value = false;
    finished.value = '';
    importError.value = '';
    notice.value = '';
  }
  function resetSelection() {
    selectionInitialized = false;
    selected.value = [];
    pendingRegion.value = undefined;
    blockedSource.value = false;
    demoMode.value = false;
  }
  async function intake(files: File[], fromDemo = false) {
    if (!fromDemo) cancelDemo();
    if (!canIntake.value) {
      if (step.value === 'apply') notice.value = 'stash_import.go_back_for_image';
      return;
    }
    if (!(await leaveConflict())) return;
    resetImport();
    resetSelection();
    demoMode.value = fromDemo;
    step.value = 'intake';
    await select(files);
    syncSelection();
    if (result.value) step.value = 'review';
  }
  async function startOver() {
    cancelDemo();
    if (!(await leaveConflict())) return;
    clear();
    resetImport();
    resetSelection();
    step.value = 'intake';
  }
  async function scanWindow(video: HTMLVideoElement) {
    if (scanningWindow.value) return;
    scanningWindow.value = true;
    try {
      const file = await frame(video);
      if (!file) return;
      await select([file]);
      if (result.value) step.value = 'review';
    } finally {
      scanningWindow.value = false;
    }
  }
  function dragEnter(event: DragEvent) {
    if (!canIntake.value || !event.dataTransfer?.types.includes('Files')) return;
    dragDepth++;
    dragging.value = true;
  }
  function dragLeave() {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dragging.value = false;
  }
  async function drop(event: DragEvent) {
    dragDepth = 0;
    dragging.value = false;
    await intake(Array.from(event.dataTransfer?.files ?? []));
  }
  onMounted(() => {
    if (!props.windowScan) document.addEventListener('paste', paste);
  });
  onBeforeUnmount(() => document.removeEventListener('paste', paste));
  onBeforeUnmount(cancelDemo);
  function cancelDemo() {
    demoController.value?.abort();
    demoController.value = undefined;
  }
  async function useDemo() {
    if (!canIntake.value) return;
    cancelDemo();
    const controller = new AbortController();
    demoController.value = controller;
    try {
      await acceptDemo(controller, await demoFile(controller.signal));
    } catch (failure) {
      reportDemoFailure(controller, failure);
    } finally {
      settleDemo(controller);
    }
  }
  async function demoFile(signal: AbortSignal): Promise<File> {
    const response = await fetch('/img/demos/stash-1440p.png', { signal });
    if (!response.ok) throw scanError('scan_failed');
    return new File([await response.blob()], 'stash-demo.png', { type: 'image/png' });
  }
  async function acceptDemo(controller: AbortController, file: File) {
    if (demoController.value !== controller) return;
    await intake([file], true);
    if (demoMode.value) notice.value = 'stash_import.demo_no_save';
  }
  function reportDemoFailure(controller: AbortController, failure: unknown) {
    if (!controller.signal.aborted) report(failure);
  }
  function settleDemo(controller: AbortController) {
    if (demoController.value === controller) demoController.value = undefined;
  }
  async function paste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) return;
    event.preventDefault();
    await intake(files);
  }
  async function clipboardImage(): Promise<File | undefined> {
    for (const entry of await navigator.clipboard.read()) {
      const type = entry.types.find((candidate) => candidate.startsWith('image/'));
      if (type) return new File([await entry.getType(type)], 'clipboard', { type });
    }
    return undefined;
  }
  async function pasteFromClipboard() {
    importError.value = '';
    try {
      const file = await clipboardImage();
      if (file) await intake([file]);
      else importError.value = 'stash_import.errors.clipboard_empty';
    } catch {
      importError.value = 'stash_import.errors.clipboard_denied';
    }
  }
  async function applyRegion() {
    const rect = pendingRegion.value;
    pendingRegion.value = undefined;
    if (rect) await region(rect);
  }
  function updateActive(patch: Partial<ReviewedCell>) {
    if (active.value) Object.assign(active.value, patch);
  }
  function markAllFir() {
    for (const row of rows.value.filter((entry) => !entry.excluded)) row.raidStatus = 'fir';
  }
  function goToApply() {
    if (!canContinue.value) return;
    importError.value = '';
    error.value = '';
    allowDecreases.value = false;
    step.value = 'apply';
  }
  function report(failure: unknown) {
    const message = failure instanceof Error ? failure.message : '';
    importError.value = message.startsWith('stash_import.errors.')
      ? message
      : 'stash_import.errors.save_unknown';
  }
  const updatesOf = (changes: ImportChange[]) =>
    JSON.stringify(changes.map(({ id, type, count }) => [type, id, count]));
  /** Reads the cloud baseline, then refuses to save numbers other than the ones on screen. */
  async function prepareShown(shown: string): Promise<PreviewData | undefined> {
    const prepared = await importer.prepare(
      result.value!.sourceHash,
      reviewedTotals(rows.value, tracked()),
      selected.value,
      importMode.value
    );
    if (updatesOf(prepared.changes) === shown) return prepared;
    importError.value = 'stash_import.errors.stale';
    return undefined;
  }
  async function save() {
    if (!canSave.value) return;
    // Captured before any await: this is exactly what the player is looking at.
    const shown = updatesOf(liveChanges.value);
    saving.value = true;
    resetImport();
    try {
      preview.value = await prepareShown(shown);
      if (!preview.value) return;
      const receipt = await importer.commit(
        preview.value,
        reviewedTotals(rows.value, tracked()),
        selected.value
      );
      await showReceipt(receipt);
    } catch (failure) {
      report(failure);
      uncertain.value =
        Boolean(preview.value) && importError.value === 'stash_import.errors.save_unknown';
    } finally {
      saving.value = false;
    }
  }
  /**
   * Reasons a retry with this same screenshot cannot succeed while its receipt is retained.
   * `import_id_reused` is not here: every save prepares a fresh import ID, so a retry is safe.
   */
  const PERMANENT_CONFLICTS = ['progress_reset'];
  async function showReceipt(receipt: { status: string; reason?: string }) {
    if (receipt.status === 'conflict') {
      conflicted.value = true;
      await refreshAfterConflict(PERMANENT_CONFLICTS.includes(receipt.reason ?? ''));
      return;
    }
    importError.value = '';
    uncertain.value = false;
    finished.value = receipt.status;
    step.value = 'done';
  }
  /** Pull in the newer progress, then either ask for a fresh check or explain the dead end. */
  async function refreshAfterConflict(permanent: boolean) {
    if (permanent) blockedSource.value = true;
    if (!(await runReconcile())) return;
    preview.value = undefined;
    allowDecreases.value = false;
    if (!permanent) {
      notice.value = 'stash_import.conflict_refreshed';
      return;
    }
    importError.value = 'stash_import.errors.reimport_blocked';
  }
  async function checkReceipt() {
    if (!preview.value) return;
    saving.value = true;
    try {
      if (await importer.recover(preview.value)) await showReceipt({ status: 'applied' });
      else importError.value = 'stash_import.errors.receipt_missing';
    } catch (failure) {
      report(failure);
    } finally {
      saving.value = false;
    }
  }
  async function leaveConflict(): Promise<boolean> {
    if (!conflicted.value) return true;
    return reconcileConflict();
  }
  async function runReconcile(): Promise<boolean> {
    try {
      await importer.recover(preview.value!);
      conflicted.value = false;
      return true;
    } catch (failure) {
      report(failure);
      return false;
    }
  }
  async function reconcileConflict(): Promise<boolean> {
    saving.value = true;
    try {
      if (!(await runReconcile())) return false;
      preview.value = undefined;
      importError.value = blockedSource.value ? 'stash_import.errors.reimport_blocked' : '';
      return true;
    } finally {
      saving.value = false;
    }
  }
  async function backToReview() {
    if (!(await leaveConflict())) return;
    resetImport();
    step.value = 'review';
  }
  watch(source, (file) => {
    if (!file && step.value === 'review') step.value = 'intake';
  });
</script>
