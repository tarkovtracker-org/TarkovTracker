import { useItemDistribution } from '@/composables/useItemDistribution';
import { planGroupedCountAdjustment } from '@/features/neededitems/groupedCountAdjustment';
import { neededCountOf } from '@/features/neededitems/useNeededItemProgress';
import { useNeedSelfCompletion } from '@/features/neededitems/useNeedSelfCompletion';
import { useActionHistoryStore } from '@/stores/useActionHistoryStore';
import { useTarkovStore } from '@/stores/useTarkov';
import type { BreakdownSection } from '@/features/neededitems/NeededItemGroupBreakdown.vue';
import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
type Need = NeededItemTaskObjective | NeededItemHideoutModule;
// History entries outlive cards. Weak keys keep their version metadata alive only with the entry.
const undoVersions = new WeakMap<object, Map<string, number>>();
const revisionsByHistory = new WeakMap<object, Map<string, { revision: number }>>();
function countRevision(
  history: ReturnType<typeof useActionHistoryStore>,
  key: string,
  read: () => string
) {
  let records = revisionsByHistory.get(history);
  if (!records) {
    records = new Map();
    revisionsByHistory.set(history, records);
  }
  const existing = records.get(key);
  if (existing) return existing.revision;
  const entry = { revision: 0 };
  records.set(key, entry);
  // Observe each semantic change synchronously, including A → B → A without timestamps.
  // The detached scope survives card unmounts and stops when history releases this record.
  const scope = effectScope(true);
  scope.run(() => {
    watch(read, () => entry.revision++, { flush: 'sync' });
    watch(
      () => [...history.undoStack],
      (actions) => {
        if (actions.some((action) => undoVersions.get(action)?.has(key))) return;
        scope.stop();
        records.delete(key);
      }
    );
  });
  return entry.revision;
}
function rebaseUndoVersions(
  actions: object[],
  restored: { key: string; before: number; after: number }[]
) {
  actions.forEach((action) => {
    const versions = undoVersions.get(action);
    restored.forEach(({ key, before, after }) => {
      if (versions?.get(key) === before) versions.set(key, after);
    });
  });
}
export function useGroupedItemTracking(needs: () => Need[], itemName: () => string) {
  const store = useTarkovStore();
  const history = useActionHistoryStore();
  const { sortTaskObjectives, sortHideoutModules } = useItemDistribution();
  const { isSelfCompleted } = useNeedSelfCompletion();
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const { $supabase } = useNuxtApp();
  const scope = () => `${$supabase.user.id ?? null}:${store.getCurrentGameMode()}`;
  const initialScope = scope();
  const isActive = () => scope() === initialScope;
  const versionKey = (need: Need) => `${initialScope}:${need.needType}:${need.id}`;
  const record = (need: Need) => {
    const data = store.getCurrentProgressData();
    return need.needType === 'taskObjective'
      ? data.taskObjectives?.[need.id]
      : data.hideoutParts?.[need.id];
  };
  // Persistence can reorder/default fields without changing progress.
  const recordVersion = (need: Need) => {
    const saved = record(need);
    return JSON.stringify([saved?.count ?? 0, saved?.complete ?? false, saved?.timestamp ?? 0]);
  };
  const revision = (need: Need) =>
    countRevision(history, versionKey(need), () => recordVersion(need));
  const currentCount = (need: Need) => {
    const saved = record(need);
    // Older checked objectives/parts can have a completion flag without a count.
    return Math.min(
      saved?.count || (saved?.complete ? neededCountOf(need) : 0),
      neededCountOf(need)
    );
  };
  const personalNeeds = computed(() =>
    [...new Map(needs().map((need) => [`${need.needType}:${need.id}`, need])).values()].filter(
      (need) => need.needType !== 'taskObjective' || !need.hiddenForSelf
    )
  );
  const ordered = computed(() => [
    ...sortTaskObjectives(personalNeeds.value.filter((need) => need.needType === 'taskObjective')),
    ...sortHideoutModules(personalNeeds.value.filter((need) => need.needType === 'hideoutModule')),
  ]);
  const targets = computed(() =>
    ordered.value.map((need) => ({
      id: `${need.needType}:${need.id}`,
      need,
      total: neededCountOf(need),
      current: isSelfCompleted(need) ? neededCountOf(need) : currentCount(need),
      fixed: isSelfCompleted(need),
    }))
  );
  const rows = computed(() =>
    [true, false].flatMap((fir) => {
      const entries = targets.value.filter((target) => Boolean(target.need.foundInRaid) === fir);
      if (!entries.length) return [];
      return [
        {
          fir,
          current: entries.reduce((sum, entry) => sum + entry.current, 0),
          total: entries.reduce((sum, entry) => sum + entry.total, 0),
          minimum: entries.reduce((sum, entry) => sum + (entry.fixed ? entry.current : 0), 0),
          disabled: !isActive() || entries.every((entry) => entry.fixed),
        },
      ];
    })
  );
  const sections = computed<BreakdownSection[]>(() =>
    ['taskObjective', 'hideoutModule'].flatMap((type) =>
      [true, false].flatMap((fir) => {
        const entries = targets.value.filter(
          (target) => target.need.needType === type && Boolean(target.need.foundInRaid) === fir
        );
        if (!entries.length) return [];
        return [
          {
            key: `${type}-${fir}`,
            source: type === 'taskObjective' ? ('tasks' as const) : ('hideout' as const),
            fir,
            current: entries.reduce((sum, entry) => sum + entry.current, 0),
            total: entries.reduce((sum, entry) => sum + entry.total, 0),
          },
        ];
      })
    )
  );
  const remaining = computed(() =>
    targets.value.reduce((sum, target) => sum + target.total - target.current, 0)
  );
  const writeCount = (need: Need, count: number) => {
    if (need.needType === 'taskObjective') {
      store.setObjectiveCount(need.id, count);
      if (count < neededCountOf(need)) store.setTaskObjectiveUncomplete(need.id);
      return;
    }
    store.setHideoutPartCount(need.id, count);
    if (count >= neededCountOf(need)) store.setHideoutPartComplete(need.id);
    else store.setHideoutPartUncomplete(need.id);
  };
  const restore = (need: Need, before: { count?: number; complete?: boolean }) => {
    if (need.needType === 'taskObjective') {
      store.setTaskObjectiveCountWithStatus(need.id, before.count ?? 0, before.complete ?? false);
      return;
    }
    store.setHideoutPartCount(need.id, before.count ?? 0);
    if (before.complete) store.setHideoutPartComplete(need.id);
    else store.setHideoutPartUncomplete(need.id);
  };
  const setCount = (fir: boolean, count: number) => {
    if (!isActive()) return;
    const entries = targets.value.filter((target) => Boolean(target.need.foundInRaid) === fir);
    const updates = planGroupedCountAdjustment(entries, count);
    if (!updates.length) return;
    const before = updates.map(({ target }) => ({ ...record(target.need) }));
    const beforeVersions = updates.map(({ target }) => revision(target.need));
    updates.forEach(({ target, count: next }) => writeCount(target.need, next));
    const versions = new Map(
      updates.map(({ target }) => [versionKey(target.need), revision(target.need)])
    );
    const id = `needed-count-${crypto.randomUUID()}`;
    const title = t('needed_items.inline_counts.updated', { name: itemName() });
    history.pushAction({
      id,
      description: title,
      undo: () => {
        const unchanged = updates.every(
          ({ target }) =>
            !isSelfCompleted(target.need) &&
            revision(target.need) === versions.get(versionKey(target.need))
        );
        if (!isActive() || !unchanged)
          throw new Error(t('needed_items.inline_counts.undo_conflict'));
        updates.forEach(({ target }, index) => restore(target.need, before[index]!));
        // A successful Undo can stamp completion again. Rebase only earlier snapshots that
        // expected the exact state we restored, preserving guards against external changes.
        rebaseUndoVersions(
          history.undoStack,
          updates.map(({ target }, index) => ({
            key: versionKey(target.need),
            before: beforeVersions[index]!,
            after: revision(target.need),
          }))
        );
      },
    });
    const action = history.undoStack.at(-1);
    if (action) undoVersions.set(action, versions);
    toast.add({
      id: 'needed-items-count',
      title,
      actions: [
        {
          label: t('page.tasks.questcard.undo'),
          onClick: () => {
            if (history.undoStack.at(-1)?.id === id) void history.undoLastAction();
          },
        },
      ],
    });
  };
  return { rows, sections, remaining, setCount };
}
