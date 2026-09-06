import { describe, expect, it, vi } from 'vitest';
import { refreshSupabaseSession } from '@/utils/supabaseAuth';
const mockLogger = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@/utils/logger', () => ({ logger: mockLogger }));
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
  it('logs and rethrows refresh failures', async () => {
    const error = new Error('refresh failed');
    const client = {
      auth: {
        refreshSession: vi.fn().mockRejectedValue(error),
      },
    };
    await expect(refreshSupabaseSession(client)).rejects.toBe(error);
    expect(mockLogger.warn).toHaveBeenCalledWith('[SupabaseAuth] Session refresh failed:', error);
  });
  it('clears the coalescing cache after a failure so the next call retries', async () => {
    const error = new Error('refresh failed');
    const refreshSession = vi.fn().mockRejectedValue(error);
    const client = { auth: { refreshSession } };
    await expect(refreshSupabaseSession(client)).rejects.toBe(error);
    await expect(refreshSupabaseSession(client)).rejects.toBe(error);
    expect(refreshSession).toHaveBeenCalledTimes(2);
  });
  it('reports no session when the client cannot refresh', async () => {
    // The offline fallback client exposes no auth methods.
    await expect(refreshSupabaseSession({ auth: {} })).resolves.toBeNull();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
  it('calls refreshSession with the auth object as receiver', async () => {
    const auth = {
      marker: 'auth-object',
      refreshSession: vi.fn(function (this: { marker?: string }) {
        return Promise.resolve({
          data: { session: { marker: this?.marker } as never, user: null },
          error: null,
        });
      }),
    };
    await expect(refreshSupabaseSession({ auth } as never)).resolves.toEqual({
      marker: 'auth-object',
    });
  });
});
