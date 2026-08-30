import { describe, expect, it, vi } from 'vitest';
import { refreshSupabaseSession } from '@/utils/supabaseAuth';
const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
};
describe('refreshSupabaseSession', () => {
  it('shares an in-flight refresh for the same Supabase client', async () => {
    const deferred = createDeferred<{ data: { user: null; session: null }; error: null }>();
    const refreshSession = vi.fn(() => deferred.promise);
    const client = { auth: { refreshSession } };
    const first = refreshSupabaseSession(client);
    const second = refreshSupabaseSession(client);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    deferred.resolve({ data: { user: null, session: null }, error: null });
    await expect(Promise.all([first, second])).resolves.toEqual([null, null]);
    await refreshSupabaseSession(client);
    expect(refreshSession).toHaveBeenCalledTimes(2);
  });
});
