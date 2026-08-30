import type { Session, SupabaseClient } from '@supabase/supabase-js';
const pendingRefreshes = new WeakMap<object, Promise<Session | null>>();
type SupabaseAuthClient = Pick<SupabaseClient['auth'], 'refreshSession'>;
export const refreshSupabaseSession = async (client: {
  auth: SupabaseAuthClient;
}): Promise<Session | null> => {
  const clientKey = client as object;
  const pending = pendingRefreshes.get(clientKey);
  if (pending) return pending;
  const refresh = (async () => {
    const { data, error } = await client.auth.refreshSession();
    if (error) throw error;
    return data.session;
  })();
  pendingRefreshes.set(clientKey, refresh);
  try {
    return await refresh;
  } finally {
    if (pendingRefreshes.get(clientKey) === refresh) {
      pendingRefreshes.delete(clientKey);
    }
  }
};
