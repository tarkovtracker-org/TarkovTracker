// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { maybeNotifyApiUpdate, resetApiUpdateState } from '@/stores/tarkov/apiUpdateNotifier';
const { nuxtApp } = vi.hoisted(() => ({ nuxtApp: vi.fn() }));
mockNuxtImport('useNuxtApp', () => nuxtApp);
describe('maybeNotifyApiUpdate', () => {
  beforeEach(() => {
    resetApiUpdateState();
    nuxtApp.mockImplementation(() => {
      throw new Error('Nuxt app unavailable');
    });
  });
  it('includes active task updates in the toast description', () => {
    const metadataStore = {
      getTaskById: (id: string) => (id === 'task-active' ? { name: 'Active Quest' } : undefined),
    };
    const toastI18n = { showApiUpdated: vi.fn() };
    const data = {
      lastApiUpdate: {
        id: 'update-active-task',
        at: 1000,
        source: 'api',
        tasks: [{ id: 'task-active', state: 'active' }],
      },
    };
    expect(
      maybeNotifyApiUpdate('pvp', data as never, metadataStore as never, 1000, toastI18n as never)
    ).toBe(true);
    expect(toastI18n.showApiUpdated).toHaveBeenCalledWith('Task updated: Active Quest -> active.');
  });
  it('uses the fallback active label when Nuxt i18n is unavailable', () => {
    const toastI18n = { showApiUpdated: vi.fn() };
    const data = {
      lastApiUpdate: {
        id: 'update-active-task-fallback',
        at: 1000,
        source: 'api',
        tasks: [
          { id: 'task-active', state: 'active' },
          { id: 'task-completed', state: 'completed' },
        ],
      },
    };
    expect(
      maybeNotifyApiUpdate(
        'pvp',
        data as never,
        { getTaskById: () => undefined } as never,
        1000,
        toastI18n as never
      )
    ).toBe(true);
    expect(toastI18n.showApiUpdated).toHaveBeenCalledWith(
      'Tasks updated: task-active -> active, task-completed -> completed.'
    );
  });
});
