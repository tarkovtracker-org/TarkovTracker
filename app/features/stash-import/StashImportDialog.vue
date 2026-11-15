<template>
  <UModal
    :open="true"
    :title="$t('stash_import.title')"
    :description="$t('stash_import.description')"
    :dismissible="!saving"
    :ui="{ content: 'sm:max-w-6xl' }"
    scrollable
    @update:open="close"
  >
    <template #body>
      <div class="space-y-4" @dragover.prevent @drop.prevent="drop">
        <div class="bg-primary-500/10 text-primary-200 rounded-lg p-3 text-sm">
          {{ $t('stash_import.local_notice') }}
          <span class="block">{{ $t('stash_import.visible_only') }}</span>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <label
            class="bg-surface-800 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 px-4 py-3"
          >
            <UIcon name="i-mdi-image-plus" class="size-5" />
            {{ $t('stash_import.choose_image') }}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="sr-only"
              :disabled="intakeLocked"
              @change="fileChanged"
            />
          </label>
          <span class="text-sm">
            {{ $t('stash_import.destination') }}:
            <strong>{{ store.currentGameMode.toUpperCase() }}</strong>
          </span>
        </div>
        <p v-if="!source" class="text-surface-400 text-sm">{{ $t('stash_import.intake_help') }}</p>
        <div v-if="busy" class="space-y-2" role="status" aria-live="polite">
          <p>{{ $t(`stash_import.stage_${stage}`) }}</p>
          <progress :value="completed" :max="total" class="w-full" />
          <UButton variant="soft" @click="cancel">{{ $t('common.cancel') }}</UButton>
        </div>
        <p v-if="displayError" role="alert" class="text-error-300 bg-error-500/10 rounded p-3">
          {{ $t(displayError) }}
        </p>
        <div
          v-if="finished"
          role="status"
          class="bg-success-500/10 text-success-300 rounded-lg p-4"
        >
          <p class="font-semibold">
            {{ $t(completionKey) }}
          </p>
          <p class="mt-1 text-sm">{{ $t('stash_import.saved_detail') }}</p>
          <UButton class="mt-3" @click="$emit('close')">{{ $t('common.close') }}</UButton>
        </div>
        <div v-else-if="image && !busy && !preview" :inert="preparing" class="space-y-4">
          <div class="grid gap-4 lg:grid-cols-2">
            <div class="space-y-3">
              <StashScreenshot
                :image="image"
                :width="width"
                :height="height"
                :rows="rows"
                :active="active"
                @select="activeKey = $event"
                @region="selectRegion"
              />
              <UButton variant="link" size="sm" @click="rescan">
                {{ $t('stash_import.rescan') }}
              </UButton>
              <StashRegionEditor
                v-if="pendingRegion"
                v-model="pendingRegion"
                @apply="applyRegion"
                @cancel="pendingRegion = undefined"
              />
            </div>
            <StashImportReview
              v-if="result"
              v-model:active-key="activeKey"
              :result="result"
              :rows="rows"
              :remaining="remaining"
              :active="active"
              :item-name="itemName"
              @next="next"
              @split="split"
              @change="updateActive"
              @mark-fir="markAllFir"
            />
          </div>
          <StashImportTargets
            v-if="result"
            v-model="selected"
            :available-targets="availableTargets"
            :remaining="remaining"
            :item-name="itemName"
            :signed-in="importer.signedIn.value"
            :preparing="preparing"
            @preview="preparePreview"
          />
        </div>
        <StashImportPreview
          v-if="preview && !finished"
          v-model:allow-decreases="allowDecreases"
          :preview="preview"
          :item-name="itemName"
          :has-decreases="hasDecreases"
          :stale="stale"
          :uncertain="uncertain"
          :saving="saving"
          @save="save"
          @recover="checkReceipt"
          @back="backToReview"
        />
      </div>
    </template>
  </UModal>
</template>
<script setup lang="ts">
  import StashImportPreview from '@/features/stash-import/StashImportPreview.vue';
  import StashImportReview from '@/features/stash-import/StashImportReview.vue';
  import StashImportTargets from '@/features/stash-import/StashImportTargets.vue';
  import StashRegionEditor from '@/features/stash-import/StashRegionEditor.vue';
  import StashScreenshot from '@/features/stash-import/StashScreenshot.vue';
  import {
    useStashImport,
    type StashImportPreview as PreviewData,
  } from '@/features/stash-import/useStashImport';
  import { useStashScanSession } from '@/features/stash-import/useStashScanSession';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { reviewedTotals } from '@/utils/stashScan/review';
  import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
  import type { ReviewedCell, ScanRect } from '@/utils/stashScan/types';
  const props = defineProps<{ needs: (NeededItemTaskObjective | NeededItemHideoutModule)[] }>();
  const emit = defineEmits<{ close: [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const store = useTarkovStore();
  const {
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
  const importer = useStashImport(() => props.needs);
  const selected = ref<string[]>([]);
  const preview = shallowRef<PreviewData>();
  const preparing = ref(false);
  const saving = ref(false);
  const uncertain = ref(false);
  const finished = ref('');
  const importError = ref('');
  const displayError = computed(() => error.value || importError.value);
  const intakeLocked = computed(() => busy.value || saving.value || preparing.value);
  const completionKey = computed(() =>
    finished.value === 'duplicate' ? 'stash_import.already_imported' : 'stash_import.saved'
  );
  const allowDecreases = ref(false);
  const pendingRegion = ref<ScanRect>();
  const totals = computed(() => {
    try {
      return reviewedTotals(rows.value);
    } catch {
      return [];
    }
  });
  const availableTargets = computed(() => importer.targets(totals.value));
  const targetKeys = computed(() => availableTargets.value.map((target) => target.key).join('|'));
  watch(
    targetKeys,
    () => {
      selected.value = availableTargets.value.map((target) => target.key);
    },
    { immediate: true }
  );
  const hasDecreases = computed(
    () => preview.value?.changes.some((change) => change.count < change.before) ?? false
  );
  const stale = computed(() => (preview.value ? !importer.sameLocal(preview.value) : false));
  function itemName(id: string) {
    return (
      result.value?.catalog.items.find((item) => item.id === id)?.name ??
      t('stash_import.unidentified')
    );
  }
  function close(open: boolean) {
    if (!open && !saving.value) emit('close');
  }
  function resetImport() {
    preview.value = undefined;
    uncertain.value = false;
    finished.value = '';
    importError.value = '';
  }
  async function intake(files: File[]) {
    if (saving.value || preparing.value) return;
    resetImport();
    pendingRegion.value = undefined;
    await select(files);
  }
  async function fileChanged(event: Event) {
    const input = event.target as HTMLInputElement;
    await intake(Array.from(input.files ?? []));
    input.value = '';
  }
  async function drop(event: DragEvent) {
    await intake(Array.from(event.dataTransfer?.files ?? []));
  }
  onMounted(() => document.addEventListener('paste', paste));
  onBeforeUnmount(() => document.removeEventListener('paste', paste));
  async function paste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) return;
    event.preventDefault();
    await intake(files);
  }
  function selectRegion(rect: ScanRect) {
    pendingRegion.value = rect;
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
  function report(failure: unknown) {
    const message = failure instanceof Error ? failure.message : '';
    importError.value = message.startsWith('stash_import.errors.')
      ? message
      : 'stash_import.errors.save_unknown';
  }
  async function preparePreview() {
    preparing.value = true;
    importError.value = '';
    try {
      preview.value = await importer.prepare(
        result.value!.sourceHash,
        reviewedTotals(rows.value),
        selected.value
      );
      allowDecreases.value = false;
    } catch (failure) {
      report(failure);
    } finally {
      preparing.value = false;
    }
  }
  const decreasesConfirmed = computed(() => !hasDecreases.value || allowDecreases.value);
  function showReceipt(status: string) {
    if (status === 'conflict') importError.value = 'stash_import.errors.stale';
    else finished.value = status;
  }
  async function save() {
    if (!preview.value || !decreasesConfirmed.value) return;
    saving.value = true;
    importError.value = '';
    try {
      const receipt = await importer.commit(
        preview.value,
        reviewedTotals(rows.value),
        selected.value
      );
      showReceipt(receipt.status);
    } catch (failure) {
      report(failure);
      uncertain.value = importError.value === 'stash_import.errors.save_unknown';
    } finally {
      saving.value = false;
    }
  }
  async function checkReceipt() {
    if (!preview.value) return;
    saving.value = true;
    try {
      if (await importer.recover(preview.value)) finished.value = 'applied';
      else importError.value = 'stash_import.errors.receipt_missing';
    } catch (failure) {
      report(failure);
    } finally {
      saving.value = false;
    }
  }
  function backToReview() {
    preview.value = undefined;
    importError.value = '';
    uncertain.value = false;
  }
</script>
