import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useTarkovStore } from '@/stores/useTarkov';
import type { PlayerLevel, Task } from '@/types/tarkov';
const mockTasks: Task[] = [
  {
    id: 'task-1',
    name: 'Task 1',
    experience: 1000,
    objectives: [],
  } as Task,
  {
    id: 'task-2',
    name: 'Task 2',
    experience: 2000,
    objectives: [],
  } as Task,
];
const mockPlayerLevels: PlayerLevel[] = [
  { level: 1, exp: 0, levelBadgeImageLink: '' },
  { level: 2, exp: 1000, levelBadgeImageLink: '' },
  { level: 3, exp: 3000, levelBadgeImageLink: '' },
];
describe('automatic level sync plugin', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const metadataStore = useMetadataStore();
    metadataStore.tasks = mockTasks;
    metadataStore.playerLevels = mockPlayerLevels;
  });
  it('keeps the stored player level in sync while automatic calculation is enabled', async () => {
    const preferencesStore = usePreferencesStore();
    const tarkovStore = useTarkovStore();
    preferencesStore.setUseAutomaticLevelCalculation(true);
    const plugin = (await import('@/plugins/02.automatic-level-sync.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    expect(tarkovStore.playerLevel()).toBe(1);
    tarkovStore.setTaskComplete('task-1');
    await nextTick();
    expect(tarkovStore.playerLevel()).toBe(2);
    tarkovStore.setTaskComplete('task-2');
    await nextTick();
    expect(tarkovStore.playerLevel()).toBe(3);
  });
  it('does not overwrite the stored level while automatic calculation is disabled', async () => {
    const preferencesStore = usePreferencesStore();
    const tarkovStore = useTarkovStore();
    preferencesStore.setUseAutomaticLevelCalculation(false);
    tarkovStore.setLevel(7);
    const plugin = (await import('@/plugins/02.automatic-level-sync.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    tarkovStore.setTaskComplete('task-1');
    await nextTick();
    expect(tarkovStore.playerLevel()).toBe(7);
  });
  it('waits for player-level metadata before syncing the derived level', async () => {
    const metadataStore = useMetadataStore();
    const preferencesStore = usePreferencesStore();
    const tarkovStore = useTarkovStore();
    metadataStore.playerLevels = [];
    preferencesStore.setUseAutomaticLevelCalculation(true);
    tarkovStore.setLevel(9);
    const plugin = (await import('@/plugins/02.automatic-level-sync.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await nextTick();
    expect(tarkovStore.playerLevel()).toBe(9);
    metadataStore.playerLevels = mockPlayerLevels;
    await nextTick();
    expect(tarkovStore.playerLevel()).toBe(1);
  });
  it('does not throw when player-level metadata is still undefined', async () => {
    const metadataStore = useMetadataStore();
    const preferencesStore = usePreferencesStore();
    metadataStore.playerLevels = undefined as unknown as PlayerLevel[];
    preferencesStore.setUseAutomaticLevelCalculation(true);
    const plugin = (await import('@/plugins/02.automatic-level-sync.client')).default;
    expect(() => plugin({} as Parameters<typeof plugin>[0])).not.toThrow();
  });
});
