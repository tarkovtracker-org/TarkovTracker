import { describe, expect, it, vi } from 'vitest';
import {
  maybeNotifyApiUpdate,
  resetApiUpdateState,
  runApiUpdateHandlers,
} from '@/stores/tarkov/apiUpdateNotifier';
describe('runApiUpdateHandlers', () => {
  it('evaluates all handlers even when the first one returns true', () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => false);
    const handled = runApiUpdateHandlers([first, second]);
    expect(handled).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
  it('returns false when no handler reports an API update', () => {
    const first = vi.fn(() => false);
    const second = vi.fn(() => false);
    const handled = runApiUpdateHandlers([first, second]);
    expect(handled).toBe(false);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
describe('maybeNotifyApiUpdate fallback translations', () => {
  it('formats active when no runtime translator is available', () => {
    resetApiUpdateState();
    vi.stubGlobal('useNuxtApp', () => {
      throw new Error('not available');
    });
    const showApiUpdated = vi.fn();
    const didNotify = maybeNotifyApiUpdate(
      'pvp',
      {
        lastApiUpdate: {
          at: 1000,
          id: 'active-fallback',
          source: 'api',
          tasks: [{ id: 'task-1', state: 'active' }],
        },
      } as never,
      { getTaskById: () => ({ name: 'Task One' }) } as never,
      1000,
      { showApiUpdated } as never
    );
    expect(didNotify).toBe(true);
    expect(showApiUpdated).toHaveBeenCalledWith('Task updated: Task One -> active.');
    vi.unstubAllGlobals();
  });
});
