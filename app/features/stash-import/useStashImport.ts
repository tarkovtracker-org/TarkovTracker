import { useItemDistribution, type ObjectiveUpdate } from '@/composables/useItemDistribution';
import { getNeededItemId } from '@/features/neededitems/neededItemFilters';
import { neededCountOf } from '@/features/neededitems/useNeededItemProgress';
import { defaultState, type UserProgressData } from '@/stores/progressState';
import { deepEqual } from '@/stores/tarkov/deepEqual';
import { executeProgressMutation } from '@/stores/tarkov/progressPersistence';
import { hasPendingCloudChanges } from '@/stores/tarkov/progressSaveStatus';
import {
  getRegisteredSyncController,
  reconcileRemoteSnapshot,
} from '@/stores/tarkov/realtimeListener';
import { recordLocalSyncTime } from '@/stores/tarkov/syncTimeline';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { getGameModeSeasonNumber, type GameMode } from '@/utils/constants';
import { isRecord, sanitizeOwnedProgressData } from '@/utils/progressSanitizers';
import { scanError } from '@/utils/stashScan/types';
import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
import type { ObservedTotals } from '@/utils/stashScan/review';
type Need = NeededItemTaskObjective | NeededItemHideoutModule;
/** `add` tops up current counts; `replace` sets them to the screenshot totals. */
export type ImportMode = 'add' | 'replace';
export type ImportTarget = {
  key: string;
  need: Need;
  itemId: string;
  label: string;
  current: number;
};
export interface ImportChange extends ObjectiveUpdate {
  before: number;
  label: string;
  itemId: string;
}
export interface StashImportPreview {
  owner: string;
  mode: GameMode;
  season: number;
  importId: string;
  sourceHash: string;
  expected: Record<string, unknown> | null;
  local: UserProgressData;
  scope: string;
  importMode: ImportMode;
  changes: ImportChange[];
  excess: number;
  unknown: number;
}
export interface ImportEstimate {
  changes: ImportChange[];
  excess: number;
}
interface ImportReceipt {
  status: 'applied' | 'replayed' | 'duplicate' | 'conflict';
  /** Server explanation for conflicts, e.g. `baseline_changed` or `progress_reset`. */
  reason?: string;
  receipt_id: string | null;
  progress_data: unknown;
}
type ImportBaseline = Pick<StashImportPreview, 'owner' | 'mode' | 'season' | 'local'>;
const validNeededCount = (count: number) =>
  Number.isSafeInteger(count) && count >= 0 && count <= 1_000_000;
const lacksConfirmedFir = (total: ObservedTotals) => total.fir === 0 && total.unknown > 0;
const receiptApplied = (receipt: ImportReceipt) => ['applied', 'replayed'].includes(receipt.status);
const rpcFailure = (error: { code?: string }) =>
  scanError(error.code === 'PT429' ? 'rate_limited' : 'save_unknown');
const expectedFrom = (data: { progress_data: unknown } | null) =>
  (data?.progress_data ?? null) as Record<string, unknown> | null;
const expectedLocal = (expected: Record<string, unknown> | null, mode: GameMode) =>
  sanitizeOwnedProgressData(expected ?? defaultState[mode]);
const lookupStatus = (data: unknown): string => {
  if (!isRecord(data)) throw scanError('save_unknown');
  const status = String(data.status);
  if (!['found', 'missing'].includes(status)) throw scanError('save_unknown');
  return status;
};
const completedReceipt = (
  outcome: { error: unknown },
  receipt: ImportReceipt | undefined
): ImportReceipt => {
  if (!receipt) throw scanError('stale');
  if (outcome.error && receiptApplied(receipt)) throw scanError('save_unknown');
  return receipt;
};
const syncControls = () => {
  const controller = getRegisteredSyncController();
  return {
    pause: () => controller?.pause(),
    resume: () => controller?.resume(),
    requireReconciliation: () => controller?.requireReconciliation?.(),
  };
};
const parseReceipt = (value: unknown): ImportReceipt => {
  if (!isRecord(value)) throw scanError('save_unknown');
  if (!['applied', 'replayed', 'duplicate', 'conflict'].includes(String(value.status)))
    throw scanError('save_unknown');
  return value as unknown as ImportReceipt;
};
const receiptProgress = (receipt: ImportReceipt): UserProgressData => {
  if (!isRecord(receipt.progress_data)) throw scanError('save_unknown');
  return sanitizeOwnedProgressData(receipt.progress_data);
};
const keyOf = (need: Need) => `${need.needType}:${need.id}`;
const taskNeed = (need: Need): need is NeededItemTaskObjective => need.needType === 'taskObjective';
const cloneMode = (mode: UserProgressData): UserProgressData =>
  JSON.parse(JSON.stringify(sanitizeOwnedProgressData(mode))) as UserProgressData;
const requestUpdates = (changes: ImportChange[]) =>
  changes.map(({ id, type, count, needed }) => ({ id, type, count, needed }));
/** Browser adapter for the existing Smart Fill policy; no independent allocation rules. */
export function useStashImport(needs: MaybeRefOrGetter<Need[]>) {
  const store = useTarkovStore();
  const metadata = useMetadataStore();
  const { $supabase } = useNuxtApp();
  const distribution = useItemDistribution();
  const signedIn = computed(() => $supabase.user.loggedIn && Boolean($supabase.user.id));
  function taskEligible(need: NeededItemTaskObjective): boolean {
    const excluded = [
      need.teamId,
      need.hiddenForSelf,
      need.sourceObjectiveId,
      (need.acceptedItems?.length ?? 0) > 1,
      store.isTaskComplete(need.taskId),
      store.isTaskFailed(need.taskId),
      store.isTaskObjectiveComplete(need.id),
    ];
    return !excluded.some(Boolean) && need.type === 'giveItem';
  }
  function eligible(need: Need): boolean {
    if (!validNeededCount(need.count)) return false;
    return taskNeed(need)
      ? taskEligible(need)
      : !store.isHideoutModuleComplete(need.hideoutModule.id);
  }
  const taskLabel = (need: NeededItemTaskObjective) =>
    metadata.getTaskById(need.taskId)?.name ?? need.taskId;
  const stationLabel = (id: string) =>
    metadata.hideoutStations.find((entry) => entry.id === id)?.name ?? id;
  const hideoutLabel = (need: NeededItemHideoutModule) =>
    `${stationLabel(need.hideoutModule.stationId)} · ${need.hideoutModule.level}`;
  const labelFor = (need: Need) => (taskNeed(need) ? taskLabel(need) : hideoutLabel(need));
  /** Items any eligible requirement uses; only these can change a count. */
  const trackedItemIds = computed(
    () =>
      new Set(
        toValue(needs)
          .filter(eligible)
          .flatMap((need) => getNeededItemId(need) ?? [])
      )
  );
  function targets(totals: ObservedTotals[]): ImportTarget[] {
    const byItem = new Map(totals.map((total) => [total.itemId, total]));
    const candidates = toValue(needs)
      .filter(eligible)
      .flatMap((need) => {
        const itemId = getNeededItemId(need)!;
        const total = byItem.get(itemId);
        if (!total || (need.foundInRaid && lacksConfirmedFir(total))) return [];
        return [
          {
            key: keyOf(need),
            need: { ...need, count: neededCountOf(need) },
            itemId,
            label: labelFor(need),
            current: distribution.getObjectiveCurrentCount(need),
          },
        ];
      });
    return [...new Map(candidates.map((target) => [target.key, target])).values()];
  }
  const scopeOf = (selected: ImportTarget[]) =>
    JSON.stringify(
      selected.map(({ key, itemId, need }) => [key, itemId, need.count, need.foundInRaid])
    );
  function plan(
    totals: ObservedTotals[],
    selected: ImportTarget[],
    importMode: ImportMode
  ): ImportEstimate {
    const changes: ImportChange[] = [];
    let excess = 0;
    for (const total of totals) {
      const itemTargets = selected.filter((target) => target.itemId === total.itemId);
      const itemNeeds = itemTargets.map(({ need }) => need);
      const result = distribution.distributeItems(
        total.fir,
        total.nonFir + total.unknown,
        itemNeeds.filter(taskNeed),
        itemNeeds.filter((need): need is NeededItemHideoutModule => !taskNeed(need)),
        { additive: importMode === 'add' }
      );
      excess += result.remainingFir + result.remainingNonFir;
      changes.push(
        ...result.updates.map((update) => {
          const target = itemTargets.find(
            ({ need }) => need.id === update.id && taskNeed(need) === (update.type === 'task')
          )!;
          return { ...update, before: target.current, label: target.label, itemId: total.itemId };
        })
      );
    }
    return { changes, excess };
  }
  /** Local, synchronous preview of what `prepare` will compute against the same progress. */
  function estimate(
    totals: ObservedTotals[],
    selection: string[],
    importMode: ImportMode
  ): ImportEstimate {
    const selected = targets(totals).filter((target) => selection.includes(target.key));
    return plan(totals, selected, importMode);
  }
  const sameDestination = (
    preview: Pick<StashImportPreview, 'owner' | 'mode' | 'season'>
  ): boolean =>
    signedIn.value &&
    $supabase.user.id === preview.owner &&
    store.currentGameMode === preview.mode &&
    getGameModeSeasonNumber(preview.mode) === preview.season;
  const sameLocal = (preview: ImportBaseline) =>
    sameDestination(preview) && deepEqual(cloneMode(store[preview.mode]), preview.local);
  function assertDestination(preview: ImportBaseline): void {
    if (!sameDestination(preview)) throw scanError('stale');
  }
  function assertCatalog(mode: GameMode): void {
    if (metadata.currentGameMode !== mode || !metadata.tasksObjectivesHydrated)
      throw scanError('catalog_loading');
    if (!metadata.hideoutStations.length) throw scanError('catalog_loading');
  }
  function captureBaseline(): ImportBaseline {
    if (!signedIn.value) throw scanError('sign_in');
    if (hasPendingCloudChanges()) throw scanError('unsynced');
    const mode = store.currentGameMode;
    assertCatalog(mode);
    return {
      owner: $supabase.user.id!,
      mode,
      season: getGameModeSeasonNumber(mode),
      local: cloneMode(store[mode]),
    };
  }
  function assertCurrent(baseline: ImportBaseline): void {
    if (!sameLocal(baseline)) throw scanError('stale');
    assertCatalog(baseline.mode);
  }
  async function readExpected(baseline: ImportBaseline): Promise<Record<string, unknown> | null> {
    const { owner, mode, season, local } = baseline;
    const { data, error } = await $supabase.client
      .from('user_game_mode_progress')
      .select('progress_data')
      .eq('user_id', owner)
      .eq('game_mode', mode)
      .eq('season_number', season)
      .maybeSingle();
    assertCurrent(baseline);
    if (error) throw scanError('unsynced');
    const expected = expectedFrom(data);
    if (!deepEqual(local, expectedLocal(expected, mode))) throw scanError('unsynced');
    return expected;
  }
  async function prepare(
    sourceHash: string,
    totals: ObservedTotals[],
    selection: string[],
    importMode: ImportMode = 'replace'
  ): Promise<StashImportPreview> {
    const baseline = captureBaseline();
    const expected = await readExpected(baseline);
    const selected = targets(totals).filter((target) => selection.includes(target.key));
    const result = plan(totals, selected, importMode);
    if (result.changes.length > 256) throw scanError('too_many_targets');
    const preview: StashImportPreview = {
      ...baseline,
      expected,
      sourceHash,
      importId: crypto.randomUUID(),
      scope: scopeOf(selected),
      importMode,
      ...result,
      unknown: totals.reduce((sum, total) => sum + total.unknown, 0),
    };
    return preview;
  }
  const argsFor = (preview: StashImportPreview) => ({
    p_mode: preview.mode,
    p_season: preview.season,
    p_import_id: preview.importId,
    p_source_hash: preview.sourceHash,
    p_expected: preview.expected,
    p_updates: requestUpdates(preview.changes),
  });
  async function commit(
    preview: StashImportPreview,
    totals: ObservedTotals[],
    selection: string[]
  ): Promise<ImportReceipt> {
    assertCurrent(preview);
    if (
      scopeOf(targets(totals).filter((target) => selection.includes(target.key))) !== preview.scope
    )
      throw scanError('stale');
    const controller = syncControls();
    controller.pause();
    const modes = { [preview.mode]: preview.local };
    let receipt: ImportReceipt | undefined;
    try {
      const outcome = await executeProgressMutation(preview.owner, {
        expected: { [preview.mode]: preview.local },
        modes,
        canContinue: () => sameLocal(preview),
        send: async () => {
          const result = await $supabase.client.rpc('commit_stash_item_import', argsFor(preview));
          if (result.error) throw rpcFailure(result.error);
          receipt = parseReceipt(result.data);
          if (!receiptApplied(receipt)) return { error: receipt.status };
          modes[preview.mode] = receiptProgress(receipt);
          return { error: null };
        },
        onSuccess: () => {
          recordLocalSyncTime();
          store.$patch((state) => {
            state[preview.mode] = modes[preview.mode]!;
          });
          // Only this mode was saved. The ordinary queue must retain all other pending edits.
        },
      });
      const completed = completedReceipt(outcome, receipt);
      if (!receiptApplied(completed)) controller.requireReconciliation();
      return completed;
    } catch (failure) {
      controller.requireReconciliation();
      throw failure;
    } finally {
      controller.resume();
    }
  }
  async function recover(preview: StashImportPreview): Promise<boolean> {
    assertDestination(preview);
    const { data, error } = await $supabase.client.rpc('get_stash_item_import', {
      p_mode: preview.mode,
      p_season: preview.season,
      p_import_id: preview.importId,
    });
    assertDestination(preview);
    if (error) throw rpcFailure(error);
    const status = lookupStatus(data);
    // Missing is not retry permission. Reconcile through the normal three-way merge first.
    await reconcileRemoteSnapshot();
    assertDestination(preview);
    return status === 'found';
  }
  return {
    targets,
    trackedItemIds,
    estimate,
    prepare,
    commit,
    recover,
    sameLocal,
    signedIn,
  };
}
