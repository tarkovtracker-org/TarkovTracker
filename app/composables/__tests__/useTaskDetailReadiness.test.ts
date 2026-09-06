import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, reactive } from 'vue';
import { useTaskDetailReadiness } from '@/composables/useTaskDetailReadiness';
const metadata = reactive({
  hasInitialized: true,
  loading: false,
  languageCode: 'en',
  mode: 'regular',
  tasks: [{ id: 'task' }],
  getApiGameMode: () => metadata.mode,
  fetchTaskObjectivesData: vi.fn<() => Promise<void>>(),
  fetchTaskRewardsData: vi.fn<() => Promise<void>>(),
  fetchEditionsData: vi.fn<() => Promise<void>>(),
});
vi.mock('@/stores/useMetadata', () => ({ useMetadataStore: () => metadata }));
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
let scope: ReturnType<typeof effectScope>;
const start = () => scope.run(() => useTaskDetailReadiness())!;
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
};
describe('useTaskDetailReadiness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    scope = effectScope();
    metadata.hasInitialized = true;
    metadata.loading = false;
    metadata.languageCode = 'en';
    metadata.mode = 'regular';
    metadata.tasks = [{ id: 'task' }];
    metadata.fetchTaskObjectivesData.mockReset().mockResolvedValue();
    metadata.fetchTaskRewardsData.mockReset().mockResolvedValue();
    metadata.fetchEditionsData.mockReset().mockResolvedValue();
  });
  afterEach(() => {
    scope.stop();
    vi.useRealTimers();
  });
  it('requests both details promptly and waits for both to settle', async () => {
    const objectives = deferred();
    const rewards = deferred();
    metadata.fetchTaskObjectivesData.mockReturnValue(objectives.promise);
    metadata.fetchTaskRewardsData.mockReturnValue(rewards.promise);
    const ready = start();
    expect(metadata.fetchTaskObjectivesData).toHaveBeenCalledOnce();
    expect(metadata.fetchTaskRewardsData).toHaveBeenCalledOnce();
    expect(ready.value).toBe(false);
    objectives.resolve();
    await flush();
    expect(ready.value).toBe(false);
    rewards.resolve();
    await flush();
    expect(ready.value).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('waits for core metadata before requesting details', async () => {
    metadata.hasInitialized = false;
    const ready = start();
    expect(metadata.fetchTaskObjectivesData).not.toHaveBeenCalled();
    expect(ready.value).toBe(false);
    metadata.hasInitialized = true;
    await nextTick();
    await flush();
    expect(ready.value).toBe(true);
  });
  it('waits for edition eligibility so the first cards use the final filters', async () => {
    const editions = deferred();
    metadata.fetchEditionsData.mockReturnValue(editions.promise);
    const ready = start();
    await flush();
    expect(ready.value).toBe(false);
    editions.resolve();
    await flush();
    expect(ready.value).toBe(true);
  });
  it('does not hold an empty task result for optional requests', () => {
    metadata.tasks = [];
    expect(start().value).toBe(true);
    expect(metadata.fetchTaskRewardsData).not.toHaveBeenCalled();
  });
  it('releases the page on request failure', async () => {
    metadata.fetchTaskObjectivesData.mockRejectedValue(new Error('offline'));
    const ready = start();
    await flush();
    expect(ready.value).toBe(true);
  });
  it('releases stalled requests after three seconds without cancelling data loading', async () => {
    const objectives = deferred();
    metadata.fetchTaskObjectivesData.mockReturnValue(objectives.promise);
    const ready = start();
    await vi.advanceTimersByTimeAsync(2999);
    expect(ready.value).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(ready.value).toBe(true);
    objectives.resolve();
    await flush();
    expect(ready.value).toBe(true);
  });
  it.each(['mode', 'languageCode'] as const)(
    'ignores an old request when %s changes',
    async (key) => {
      const old = deferred();
      const current = deferred();
      metadata.fetchTaskObjectivesData
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(current.promise);
      const ready = start();
      metadata[key] = key === 'mode' ? 'pve' : 'de';
      await nextTick();
      old.resolve();
      await flush();
      expect(ready.value).toBe(false);
      current.resolve();
      await flush();
      expect(ready.value).toBe(true);
    }
  );
  it('resets readiness for a core reload and ignores the previous request', async () => {
    const old = deferred();
    metadata.fetchTaskObjectivesData.mockReturnValueOnce(old.promise);
    const ready = start();
    metadata.loading = true;
    await nextTick();
    old.resolve();
    await flush();
    expect(ready.value).toBe(false);
    metadata.loading = false;
    await nextTick();
    await flush();
    expect(ready.value).toBe(true);
    expect(metadata.fetchTaskObjectivesData).toHaveBeenCalledTimes(2);
  });
  it('cleans up timers and ignores settlement after leaving the page', async () => {
    const request = deferred();
    metadata.fetchTaskRewardsData.mockReturnValue(request.promise);
    const ready = start();
    scope.stop();
    request.resolve();
    await flush();
    expect(ready.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
