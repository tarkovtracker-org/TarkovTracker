import { beforeEach, describe, expect, it, vi } from 'vitest';
import { maybeNotifyApiUpdate, resetApiUpdateState } from '@/stores/tarkov/apiUpdateNotifier';
import type { useToastI18n } from '@/composables/useToastI18n';
import type { UserProgressData } from '@/stores/progressState';
import type { useMetadataStore } from '@/stores/useMetadata';
const metadataStore = { getTaskById: () => undefined } as unknown as ReturnType<
  typeof useMetadataStore
>;
const notify = (lastApiUpdate: UserProgressData['lastApiUpdate']) => {
  const showApiUpdated = vi.fn();
  const handled = maybeNotifyApiUpdate(
    'pvp',
    { lastApiUpdate } as UserProgressData,
    metadataStore,
    1_000,
    { showApiUpdated } as unknown as ReturnType<typeof useToastI18n>
  );
  return { handled, description: showApiUpdated.mock.calls[0]?.[0] };
};
describe('maybeNotifyApiUpdate', () => {
  beforeEach(() => {
    resetApiUpdateState();
  });
  it('counts task updates dropped by the per-entry cap', () => {
    const { handled, description } = notify({
      at: 1_000,
      id: 'capped',
      source: 'api',
      taskCount: 30,
      tasks: [
        { id: 'task-a', state: 'active' },
        { id: 'task-b', state: 'completed' },
        { id: 'task-c', state: 'failed' },
        { id: 'task-d', state: 'uncompleted' },
      ],
    });
    expect(handled).toBe(true);
    expect(description).toBe(
      'Tasks updated: task-a -> active, task-b -> completed, task-c -> failed, +27 more.'
    );
  });
  it('uses the stored list length without a recorded total', () => {
    const { description } = notify({
      at: 1_000,
      id: 'single',
      source: 'api',
      tasks: [{ id: 'task-a', state: 'completed' }],
    });
    expect(description).toBe('Task updated: task-a -> completed.');
  });
  it('counts every update not shown when fewer than the preview limit are stored', () => {
    const { description } = notify({
      at: 1_000,
      id: 'partial',
      source: 'api',
      taskCount: 30,
      tasks: [
        { id: 'task-a', state: 'completed' },
        { id: 'task-b', state: 'failed' },
      ],
    });
    expect(description).toBe('Tasks updated: task-a -> completed, task-b -> failed, +28 more.');
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
