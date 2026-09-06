import { logger } from '@/utils/logger';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
const pendingRefreshes = new WeakMap<object, Promise<Session | null>>();
type SupabaseAuthClient = Partial<Pick<SupabaseClient['auth'], 'refreshSession'>>;
type RefreshSession = NonNullable<SupabaseAuthClient['refreshSession']>;
/**
 * Resolves the client's `refreshSession`, bound to its auth object.
 *
 * The offline fallback client has no auth methods, so callers get `null` instead
 * of a `TypeError`. Binding keeps the supabase-js receiver intact.
 */
const getRefreshSession = (client: { auth: SupabaseAuthClient }): RefreshSession | null => {
  const refreshSession = client.auth?.refreshSession;
  return typeof refreshSession === 'function'
    ? (refreshSession.bind(client.auth) as RefreshSession)
    : null;
};
const requestRefresh = async (refreshSession: RefreshSession): Promise<Session | null> => {
  try {
    const { data, error } = await refreshSession();
    if (error) throw error;
    return data.session;
  } catch (error) {
    logger.warn('[SupabaseAuth] Session refresh failed:', error);
    throw error;
  }
};
const clearPendingRefresh = (clientKey: object, refresh: Promise<Session | null>): void => {
  if (pendingRefreshes.get(clientKey) === refresh) pendingRefreshes.delete(clientKey);
};
/**
 * Refreshes the Supabase session, coalescing concurrent callers per client so a
 * burst of protected requests cannot trigger a refresh storm.
 */
export const refreshSupabaseSession = async (client: {
  auth: SupabaseAuthClient;
}): Promise<Session | null> => {
  const refreshSession = getRefreshSession(client);
  if (!refreshSession) return null;
  const clientKey = client as object;
  const pending = pendingRefreshes.get(clientKey);
  if (pending) return pending;
  const refresh = requestRefresh(refreshSession);
  pendingRefreshes.set(clientKey, refresh);
  try {
    return await refresh;
  } finally {
    clearPendingRefresh(clientKey, refresh);
  }
};
