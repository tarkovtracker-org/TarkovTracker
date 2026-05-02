import { mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';
import type { LeafletMapRef, UseMapObjectivePopupReturn } from '@/composables/useMapObjectivePopup';
const createMetadataStore = (
  objectives: Array<{
    id: string;
    taskId?: string;
    zones?: Array<{ map?: { id?: string } }>;
    possibleLocations?: Array<{ map?: { id?: string } }>;
  }> = [],
  objectiveMaps: Record<string, Array<{ objectiveID: string; mapID: string }>> = {}
) => ({
  objectives,
  objectiveMaps,
});
const createPreferencesStore = (mapView = 'customs') => {
  const normalizeMapView = (value: unknown): string => {
    const candidate =
      typeof value === 'string'
        ? value
        : value && typeof value === 'object' && 'value' in value
          ? (value as { value?: unknown }).value
          : null;
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : 'all';
  };
  let taskMapView = normalizeMapView(mapView);
  return {
    get getTaskMapView() {
      return normalizeMapView(taskMapView);
    },
    setTaskMapView: vi.fn((nextMapView: string) => {
      taskMapView = normalizeMapView(nextMapView);
    }),
  };
};
const mockSetup = (options?: {
  objectives?: Parameters<typeof createMetadataStore>[0];
  objectiveMaps?: Parameters<typeof createMetadataStore>[1];
  mapView?: string;
  activateResult?: boolean | (() => boolean);
}) => {
  const metadataStore = createMetadataStore(
    options?.objectives ?? [],
    options?.objectiveMaps ?? {}
  );
  const preferencesStore = createPreferencesStore(options?.mapView ?? 'customs');
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => metadataStore,
  }));
  vi.doMock('@/stores/usePreferences', () => ({
    usePreferencesStore: () => preferencesStore,
  }));
  vi.doMock('@/utils/logger', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
  }));
  const rawResult = options?.activateResult;
  const activateResultFn: (id: string) => boolean =
    typeof rawResult === 'function' ? rawResult : () => rawResult ?? false;
  const activateObjectivePopup = vi.fn<(id: string) => boolean>(activateResultFn);
  const closeActivePopup = vi.fn();
  const leafletMapRef = ref<LeafletMapRef | null>({
    activateObjectivePopup,
    closeActivePopup,
  });
  const mapContainerRef = ref<HTMLElement | null>(document.createElement('div'));
  return { leafletMapRef, mapContainerRef, activateObjectivePopup, preferencesStore };
};
const setupComposable = async (
  mocks: ReturnType<typeof mockSetup>
): Promise<{ result: UseMapObjectivePopupReturn; wrapper: ReturnType<typeof mount> }> => {
  const { useMapObjectivePopup } = await import('@/composables/useMapObjectivePopup');
  let result: UseMapObjectivePopupReturn | null = null;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = useMapObjectivePopup({
          leafletMapRef: mocks.leafletMapRef,
          mapContainerRef: mocks.mapContainerRef,
        });
        return () => null;
      },
    })
  );
  await nextTick();
  if (!result) {
    throw new Error('useMapObjectivePopup failed to initialize');
  }
  return { result, wrapper };
};
describe('useMapObjectivePopup', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  describe('activateObjectivePopupWithRetry (via jumpToMapObjective)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    it('stops retrying on first success', async () => {
      const mocks = mockSetup({
        objectives: [{ id: 'obj-1', taskId: 'task-1' }],
        objectiveMaps: { 'task-1': [{ objectiveID: 'obj-1', mapID: 'customs' }] },
        activateResult: true,
      });
      const { result, wrapper } = await setupComposable(mocks);
      result.jumpToMapObjective('obj-1');
      expect(mocks.activateObjectivePopup).toHaveBeenCalledTimes(1);
      expect(mocks.activateObjectivePopup).toHaveBeenCalledWith('obj-1');
      await vi.advanceTimersByTimeAsync(1000);
      expect(mocks.activateObjectivePopup).toHaveBeenCalledTimes(1);
      result.cleanup();
      wrapper.unmount();
    });
    it('stops retrying after max attempts and warns', async () => {
      const mocks = mockSetup({
        objectives: [{ id: 'obj-1', taskId: 'task-1' }],
        objectiveMaps: { 'task-1': [{ objectiveID: 'obj-1', mapID: 'customs' }] },
        activateResult: false,
      });
      const { result, wrapper } = await setupComposable(mocks);
      result.jumpToMapObjective('obj-1');
      expect(mocks.activateObjectivePopup).toHaveBeenCalledTimes(1);
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(150);
      }
      expect(mocks.activateObjectivePopup).toHaveBeenCalledTimes(6);
      const { logger } = await import('@/utils/logger');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to activate popup for objective obj-1 after 6 attempts')
      );
      result.cleanup();
      wrapper.unmount();
    });
    it('retries until success within max attempts', async () => {
      let callCount = 0;
      const mocks = mockSetup({
        objectives: [{ id: 'obj-2', taskId: 'task-1' }],
        objectiveMaps: { 'task-1': [{ objectiveID: 'obj-2', mapID: 'customs' }] },
        activateResult: () => {
          callCount++;
          return callCount >= 3;
        },
      });
      const { result, wrapper } = await setupComposable(mocks);
      result.jumpToMapObjective('obj-2');
      expect(mocks.activateObjectivePopup).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(150);
      expect(mocks.activateObjectivePopup).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(150);
      expect(mocks.activateObjectivePopup).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(500);
      expect(mocks.activateObjectivePopup).toHaveBeenCalledTimes(3);
      result.cleanup();
      wrapper.unmount();
    });
    it('clears all pending timers on cleanup', async () => {
      const mocks = mockSetup({
        objectives: [{ id: 'obj-1', taskId: 'task-1' }],
        objectiveMaps: { 'task-1': [{ objectiveID: 'obj-1', mapID: 'customs' }] },
        activateResult: false,
      });
      const { result, wrapper } = await setupComposable(mocks);
      result.jumpToMapObjective('obj-1');
      expect(mocks.activateObjectivePopup).toHaveBeenCalledTimes(1);
      result.cleanup();
      await vi.advanceTimersByTimeAsync(1500);
      expect(mocks.activateObjectivePopup).toHaveBeenCalledTimes(1);
      wrapper.unmount();
    });
  });
  describe('jumpToMapObjective map resolution', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    it('switches map when objective is on a different map', async () => {
      const mocks = mockSetup({
        objectives: [{ id: 'obj-1', taskId: 'task-1' }],
        objectiveMaps: { 'task-1': [{ objectiveID: 'obj-1', mapID: 'woods' }] },
        mapView: 'customs',
        activateResult: true,
      });
      const { result, wrapper } = await setupComposable(mocks);
      await result.jumpToMapObjective('obj-1');
      expect(mocks.preferencesStore.setTaskMapView).toHaveBeenCalledWith('woods');
      result.cleanup();
      wrapper.unmount();
    });
    it('does not switch map when objective is on the current map', async () => {
      const mocks = mockSetup({
        objectives: [{ id: 'obj-1', taskId: 'task-1' }],
        objectiveMaps: { 'task-1': [{ objectiveID: 'obj-1', mapID: 'customs' }] },
        mapView: 'customs',
        activateResult: true,
      });
      const { result, wrapper } = await setupComposable(mocks);
      await result.jumpToMapObjective('obj-1');
      expect(mocks.preferencesStore.setTaskMapView).not.toHaveBeenCalled();
      result.cleanup();
      wrapper.unmount();
    });
    it('ignores stale delayed jumps when a newer objective is selected', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      const mocks = mockSetup({
        objectives: [
          { id: 'obj-a', taskId: 'task-1' },
          { id: 'obj-b', taskId: 'task-1' },
        ],
        objectiveMaps: {
          'task-1': [
            { objectiveID: 'obj-a', mapID: 'woods' },
            { objectiveID: 'obj-b', mapID: 'woods' },
          ],
        },
        mapView: 'customs',
        activateResult: true,
      });
      const { result, wrapper } = await setupComposable(mocks);
      const firstJump = result.jumpToMapObjective('obj-a');
      const secondJump = result.jumpToMapObjective('obj-b');
      await secondJump;
      expect(mocks.activateObjectivePopup).toHaveBeenCalledTimes(1);
      expect(mocks.activateObjectivePopup).toHaveBeenCalledWith('obj-b');
      await vi.advanceTimersByTimeAsync(100);
      await firstJump;
      expect(mocks.activateObjectivePopup).toHaveBeenCalledTimes(1);
      result.cleanup();
      wrapper.unmount();
    });
    it('uses zone map ID when available', async () => {
      const mocks = mockSetup({
        objectives: [{ id: 'obj-z', taskId: 'task-1', zones: [{ map: { id: 'factory' } }] }],
        mapView: 'customs',
        activateResult: true,
      });
      const { result, wrapper } = await setupComposable(mocks);
      await result.jumpToMapObjective('obj-z');
      expect(mocks.preferencesStore.setTaskMapView).toHaveBeenCalledWith('factory');
      result.cleanup();
      wrapper.unmount();
    });
    it('uses possibleLocations map ID as fallback', async () => {
      const mocks = mockSetup({
        objectives: [
          {
            id: 'obj-p',
            taskId: 'task-1',
            zones: [],
            possibleLocations: [{ map: { id: 'interchange' } }],
          },
        ],
        mapView: 'customs',
        activateResult: true,
      });
      const { result, wrapper } = await setupComposable(mocks);
      await result.jumpToMapObjective('obj-p');
      expect(mocks.preferencesStore.setTaskMapView).toHaveBeenCalledWith('interchange');
      result.cleanup();
      wrapper.unmount();
    });
  });
});
