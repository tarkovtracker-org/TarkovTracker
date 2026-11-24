import { defineStore } from 'pinia';
import {
  createModifierPlanRepository,
  readModifierPlanCandidate,
} from '@/features/seasonal-modifiers/modifierPlanStorage';
import { logger } from '@/utils/logger';
type PlanRepository = ReturnType<typeof createModifierPlanRepository>;
type PlanStatus = 'loading' | 'ready' | 'error';
type AccountScope = {
  owner: string;
  loading: boolean;
  pending: string[] | null;
};
export function createAccountModifierPlan(
  ownerId: Readonly<Ref<string | null>>,
  repository: PlanRepository,
  readCandidate: (owner: string) => string[]
) {
  const modifierIds = shallowRef<string[]>([]);
  const status = ref<PlanStatus>('loading');
  const saving = ref(false);
  const saveFailed = ref(false);
  let scope: AccountScope | null = null;
  watch(
    ownerId,
    (owner) => {
      scope = owner === null ? null : { owner, loading: false, pending: null };
      modifierIds.value = [];
      status.value = 'loading';
      saving.value = false;
      saveFailed.value = false;
    },
    { immediate: true, flush: 'sync' }
  );
  async function readOrImport(current: AccountScope) {
    const cloud = await repository.read(current.owner);
    if (current !== scope || cloud !== null) return cloud;
    const candidate = readCandidate(current.owner);
    return candidate.length ? repository.initialize(current.owner, candidate) : null;
  }
  async function load() {
    const current = scope;
    if (!current || current.loading || saving.value || current.pending) return;
    current.loading = true;
    status.value = 'loading';
    try {
      const ids = await readOrImport(current);
      if (scope !== current) return;
      modifierIds.value = ids ?? [];
      status.value = 'ready';
    } catch (error) {
      if (scope !== current) return;
      status.value = 'error';
      logger.warn('[ModifierPlanner] Could not load the account modifier plan', error);
    } finally {
      current.loading = false;
    }
  }
  async function write(current: AccountScope, ids: string[]) {
    try {
      await repository.save(current.owner, ids);
      if (scope === current) saveFailed.value = false;
      return true;
    } catch (error) {
      if (scope !== current) return false;
      current.pending ??= ids;
      saveFailed.value = true;
      logger.warn('[ModifierPlanner] Could not sync modifier selections', error);
      return false;
    }
  }
  async function retrySave() {
    const current = scope;
    if (!current || saving.value || !current.pending) return;
    saving.value = true;
    while (scope === current && current.pending) {
      const ids = current.pending;
      current.pending = null;
      if (!(await write(current, ids))) break;
    }
    if (scope === current) saving.value = false;
  }
  function save(ids: string[]) {
    if (!scope || status.value !== 'ready') return;
    modifierIds.value = ids;
    scope.pending = ids;
    void retrySave();
  }
  return { modifierIds, status, saving, saveFailed, load, save, retrySave };
}
export const useAccountModifierPlanStore = defineStore('accountModifierPlan', () => {
  const { $supabase } = useNuxtApp();
  return createAccountModifierPlan(
    computed(() => $supabase.user.id ?? null),
    createModifierPlanRepository(() => $supabase.client),
    readModifierPlanCandidate
  );
});
