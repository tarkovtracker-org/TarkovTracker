// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOwnerFencedAuthStorage,
  isSupabaseSessionChangedError,
  supabaseAuthStorageKey,
} from '@/utils/supabaseAuthFence';
const KEY = 'sb-project-auth-token';
const session = (userId: string) => JSON.stringify({ access_token: 'a', user: { id: userId } });
describe('owner-fenced Supabase auth storage', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  it('derives the same storage key as the Supabase client default', () => {
    expect(supabaseAuthStorageKey('https://project.supabase.co')).toBe(KEY);
  });
  it('passes every operation through while no owner is fenced', () => {
    const { storage } = createOwnerFencedAuthStorage(KEY, localStorage);
    storage.setItem(KEY, session('user-2'));
    expect(storage.getItem(KEY)).toBe(session('user-2'));
    storage.removeItem(KEY);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
  it('refuses to read or remove another account session while an owner is fenced', async () => {
    const fence = createOwnerFencedAuthStorage(KEY, localStorage);
    localStorage.setItem(KEY, session('user-2'));
    await fence.withOwnerFence('user-1', async () => {
      expect(() => fence.storage.getItem(KEY)).toThrow(
        expect.objectContaining({ name: 'SupabaseSessionChangedError' })
      );
      expect(() => fence.storage.removeItem(KEY)).toThrow();
      expect(() => fence.removeFencedSession()).toThrow();
    });
    expect(localStorage.getItem(KEY)).toBe(session('user-2'));
    // The fence ends with the operation.
    expect(fence.storage.getItem(KEY)).toBe(session('user-2'));
  });
  it('lets the fenced owner, unrelated keys, and unreadable values through', async () => {
    const fence = createOwnerFencedAuthStorage(KEY, localStorage);
    localStorage.setItem(`${KEY}-code-verifier`, 'verifier');
    await fence.withOwnerFence('user-1', async () => {
      localStorage.setItem(KEY, session('user-1'));
      expect(fence.storage.getItem(KEY)).toBe(session('user-1'));
      fence.removeFencedSession();
      expect(localStorage.getItem(KEY)).toBeNull();
      localStorage.setItem(KEY, 'not-json');
      expect(fence.storage.getItem(KEY)).toBe('not-json');
      fence.storage.removeItem(`${KEY}-code-verifier`);
    });
    expect(localStorage.getItem(`${KEY}-code-verifier`)).toBeNull();
  });
  it('keeps the fence until the outermost same-owner operation ends', async () => {
    const fence = createOwnerFencedAuthStorage(KEY, localStorage);
    let releaseOuter!: () => void;
    const outer = fence.withOwnerFence(
      'user-1',
      () => new Promise<void>((resolve) => (releaseOuter = resolve))
    );
    await fence.withOwnerFence('user-1', async () => undefined);
    localStorage.setItem(KEY, session('user-2'));
    expect(() => fence.storage.getItem(KEY)).toThrow();
    await expect(fence.withOwnerFence('user-2', async () => undefined)).rejects.toSatisfy(
      isSupabaseSessionChangedError
    );
    releaseOuter();
    await outer;
    expect(fence.storage.getItem(KEY)).toBe(session('user-2'));
  });
  it('requires a fence before removing the session directly', () => {
    const fence = createOwnerFencedAuthStorage(KEY, localStorage);
    localStorage.setItem(KEY, session('user-1'));
    expect(() => fence.removeFencedSession()).toThrow('requires an owner fence');
    expect(localStorage.getItem(KEY)).toBe(session('user-1'));
  });
  it('falls back to memory storage when browser storage is unavailable', () => {
    const blocked = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const { storage } = createOwnerFencedAuthStorage(KEY);
    storage.setItem(KEY, session('user-1'));
    expect(storage.getItem(KEY)).toBe(session('user-1'));
    blocked.mockRestore();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
  it('falls back to memory storage when browser storage rejects reads', () => {
    const rejecting = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    } as unknown as Storage;
    const stubbed = vi.spyOn(window, 'localStorage', 'get').mockReturnValue(rejecting);
    const { storage } = createOwnerFencedAuthStorage(KEY);
    storage.setItem(KEY, session('user-1'));
    expect(storage.getItem(KEY)).toBe(session('user-1'));
    stubbed.mockRestore();
  });
  it('keeps a persisted session readable when browser storage rejects writes', () => {
    const persisted = new Map([[KEY, session('user-1')]]);
    const full = {
      getItem: (key: string) => persisted.get(key) ?? null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: (key: string) => persisted.delete(key),
    } as unknown as Storage;
    const stubbed = vi.spyOn(window, 'localStorage', 'get').mockReturnValue(full);
    const { storage } = createOwnerFencedAuthStorage(KEY);
    expect(storage.getItem(KEY)).toBe(session('user-1'));
    storage.setItem(KEY, session('user-2'));
    expect(storage.getItem(KEY)).toBe(session('user-2'));
    expect(persisted.has(KEY)).toBe(false);
    storage.removeItem(KEY);
    expect(storage.getItem(KEY)).toBeNull();
    stubbed.mockRestore();
  });
  it('fences a session another tab persists after a rejected write', async () => {
    const persisted = new Map<string, string>();
    let writable = false;
    const flaky = {
      getItem: (key: string) => persisted.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (!writable) throw new DOMException('full', 'QuotaExceededError');
        persisted.set(key, value);
      },
      removeItem: (key: string) => persisted.delete(key),
    } as unknown as Storage;
    const stubbed = vi.spyOn(window, 'localStorage', 'get').mockReturnValue(flaky);
    const fence = createOwnerFencedAuthStorage(KEY);
    fence.storage.setItem(KEY, session('user-1'));
    writable = true;
    persisted.set(KEY, session('user-2'));
    const removal = fence.withOwnerFence('user-1', async () => fence.removeFencedSession());
    await expect(removal.catch(isSupabaseSessionChangedError)).resolves.toBe(true);
    expect(persisted.get(KEY)).toBe(session('user-2'));
    persisted.delete(KEY);
    expect(fence.storage.getItem(KEY)).toBeNull();
    stubbed.mockRestore();
  });
});
