// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { useProfileTaskMetadata } from '@/composables/useProfileTaskMetadata';
import { createDeferred } from '@/utils/test-helpers';
import type { GameMode } from '@/utils/constants';
afterEach(() => vi.unstubAllGlobals());
describe('profile mode metadata', () => {
  it('requests the selected mode and ignores responses from an obsolete mode', async () => {
    const old = createDeferred<object>();
    const mode = ref<GameMode>('pvp');
    const fetch = vi.fn((url: string) => {
      if (mode.value === 'pvp') return old.promise;
      if (url.includes('tasks-core'))
        return Promise.resolve({
          data: { tasks: [{ id: 'pve', name: 'PvE', traderRequirements: [] }] },
        });
      if (url.includes('tasks-objectives'))
        return Promise.resolve({
          data: { tasks: [{ id: 'pve', objectives: [{ id: 'pve-objective' }] }] },
        });
      if (url.includes('prestige')) return Promise.resolve({ data: { prestige: [] } });
      return Promise.resolve({ data: { storyChapters: [] } });
    });
    vi.stubGlobal('$fetch', fetch);
    const scope = effectScope();
    const result = scope.run(() => useProfileTaskMetadata(mode, ref('de')))!;
    mode.value = 'pve';
    await flushPromises();
    expect(fetch).toHaveBeenCalledWith('/api/tarkov/tasks-objectives', {
      query: { gameMode: 'pve', lang: 'de' },
    });
    expect(result.tasks.value).toEqual([
      expect.objectContaining({ id: 'pve', objectives: [{ id: 'pve-objective' }] }),
    ]);
    old.resolve({ data: { tasks: [{ id: 'pvp' }] } });
    await flushPromises();
    expect(result.tasks.value[0]?.id).toBe('pve');
    scope.stop();
  });
});
