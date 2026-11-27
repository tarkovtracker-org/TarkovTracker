import { UNTAR_CONTROL_PREVIEW_ID } from '@/types/seasonPreview';
import { seasonTwoModifiersStorageKey } from '@/utils/storageKeys';
import type { SupabaseClient } from '@supabase/supabase-js';
const table = 'season_two_modifier_plans';
const guestKey = seasonTwoModifiersStorageKey(null);
const requestTimeout = 15_000;
export function readLocalModifierPlan(key = guestKey): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
export function writeGuestModifierPlan(ids: string[]) {
  if (ids.length) localStorage.setItem(guestKey, JSON.stringify(ids));
  else localStorage.removeItem(guestKey);
}
export function readModifierPlanCandidate(owner: string): string[] {
  const eligible = (ids: string[]) =>
    [
      ...new Set(
        ids.filter((id) => id.startsWith(UNTAR_CONTROL_PREVIEW_ID + ':') && id.length <= 80)
      ),
    ].slice(0, 256);
  const previous = eligible(readLocalModifierPlan(seasonTwoModifiersStorageKey(owner)));
  return previous.length ? previous : eligible(readLocalModifierPlan());
}
export function createModifierPlanRepository(getClient: () => SupabaseClient) {
  async function read(owner: string): Promise<string[] | null> {
    const { data, error } = await getClient()
      .from(table)
      .select('modifier_ids')
      .eq('user_id', owner)
      .abortSignal(AbortSignal.timeout(requestTimeout))
      .maybeSingle();
    if (error) throw error;
    return data?.modifier_ids ?? null;
  }
  async function initialize(owner: string, ids: string[]) {
    const { error } = await getClient()
      .from(table)
      .upsert(
        { user_id: owner, modifier_ids: ids },
        { onConflict: 'user_id', ignoreDuplicates: true }
      )
      .abortSignal(AbortSignal.timeout(requestTimeout));
    if (error) throw error;
    return read(owner);
  }
  async function save(owner: string, ids: string[]) {
    const { error } = await getClient()
      .from(table)
      .upsert({ user_id: owner, modifier_ids: ids }, { onConflict: 'user_id' })
      .abortSignal(AbortSignal.timeout(requestTimeout));
    if (error) throw error;
  }
  return { read, initialize, save };
}
