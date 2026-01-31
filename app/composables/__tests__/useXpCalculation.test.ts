/**
 * Test file for useXpCalculation composable
 * Tests the XP calculation functionality and dual game mode support
 */
import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import type { Task, PlayerLevel } from '@/types/tarkov';
import { useXpCalculation } from '../useXpCalculation';
// Mock data for testing
const mockTasks: Partial<Task>[] = [
  {
    id: 'task1',
    name: 'Test Task 1',
    experience: 1000,
    objectives: [],
  },
  {
    id: 'task2',
    name: 'Test Task 2',
    experience: 2000,
    objectives: [],
  },
  {
    id: 'task3',
    name: 'Test Task 3',
    experience: 500,
    objectives: [],
  },
];
const mockPlayerLevels: PlayerLevel[] = [
  { level: 1, exp: 0, levelBadgeImageLink: '' },
  { level: 2, exp: 1000, levelBadgeImageLink: '' },
  { level: 3, exp: 3000, levelBadgeImageLink: '' },
  { level: 4, exp: 6000, levelBadgeImageLink: '' },
  { level: 5, exp: 10000, levelBadgeImageLink: '' },
];
describe('useXpCalculation', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // Setup metadata store with mock data
    const metadataStore = useMetadataStore();
    metadataStore.tasks = mockTasks as Task[];
    metadataStore.playerLevels = mockPlayerLevels;
    // Setup tarkov store with initial state - use type assertion to access the action
    const tarkovStore = useTarkovStore();
    const store = tarkovStore as unknown as { setXpOffset: (offset: number) => void };
    store.setXpOffset(0);
  });
  it('calculates quest XP correctly', () => {
    const tarkovStore = useTarkovStore();
    const { calculatedQuestXP } = useXpCalculation();
    // Initially no tasks completed
    expect(calculatedQuestXP.value).toBe(0);
    // Complete some tasks
    tarkovStore.setTaskComplete('task1');
    expect(calculatedQuestXP.value).toBe(1000);
    tarkovStore.setTaskComplete('task2');
    expect(calculatedQuestXP.value).toBe(3000); // 1000 + 2000
    tarkovStore.setTaskComplete('task3');
    expect(calculatedQuestXP.value).toBe(3500); // 1000 + 2000 + 500
  });
  it('calculates total XP with offset', () => {
    const tarkovStore = useTarkovStore();
    const store = tarkovStore as unknown as { setXpOffset: (offset: number) => void };
    const { calculatedQuestXP, totalXP } = useXpCalculation();
    // Complete a task
    tarkovStore.setTaskComplete('task1');
    expect(calculatedQuestXP.value).toBe(1000);
    // Set offset
    store.setXpOffset(500);
    expect(totalXP.value).toBe(1500); // 1000 + 500
  });
  it('derives correct level from total XP', () => {
    const { derivedLevel, setTotalXP } = useXpCalculation();
    // Test different XP thresholds
    setTotalXP(500);
    expect(derivedLevel.value).toBe(1);
    setTotalXP(1000);
    expect(derivedLevel.value).toBe(2);
    setTotalXP(2500);
    expect(derivedLevel.value).toBe(2);
    setTotalXP(3000);
    expect(derivedLevel.value).toBe(3);
    setTotalXP(10000);
    expect(derivedLevel.value).toBe(5);
  });
  it('calculates XP progress correctly', () => {
    const { xpProgress, xpToNextLevel, setTotalXP } = useXpCalculation();
    // Test at level 1 (0-1000 XP)
    setTotalXP(500);
    expect(xpProgress.value).toBe(50); // 500/1000 * 100
    expect(xpToNextLevel.value).toBe(500); // 1000 - 500
    // Test at level 2 (1000-3000 XP)
    setTotalXP(2000);
    expect(xpProgress.value).toBe(50); // (2000-1000)/(3000-1000) * 100
    expect(xpToNextLevel.value).toBe(1000); // 3000 - 2000
    // Test at max level
    setTotalXP(15000);
    expect(xpProgress.value).toBe(100);
    expect(xpToNextLevel.value).toBe(0);
  });
  it('setLevel updates XP correctly', () => {
    const { totalXP, derivedLevel, setLevel } = useXpCalculation();
    setLevel(3);
    expect(derivedLevel.value).toBe(3);
    expect(totalXP.value).toBe(3000);
    setLevel(5);
    expect(derivedLevel.value).toBe(5);
    expect(totalXP.value).toBe(10000);
  });
  it('works with dual game mode system', async () => {
    const tarkovStore = useTarkovStore();
    const { totalXP, setTotalXP } = useXpCalculation();
    // Set XP in PVP mode
    setTotalXP(2000);
    expect(totalXP.value).toBe(2000);
    // Switch to PVE mode
    await tarkovStore.switchGameMode('pve');
    expect(totalXP.value).toBe(0); // Should be 0 in fresh PVE mode
    // Set different XP in PVE mode
    setTotalXP(1500);
    expect(totalXP.value).toBe(1500);
    // Switch back to PVP - should retain original XP
    await tarkovStore.switchGameMode('pvp');
    expect(totalXP.value).toBe(2000);
  });
});
