/**
 * XP Calculation Composable
 *
 * Provides reactive XP and level calculations based on completed tasks and user offset.
 * Works with the dual game mode system (PVP/PVE) and uses metadata for level thresholds.
 *
 * @module composables/useXpCalculation
 */
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
export function useXpCalculation() {
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const getTasks = () => (Array.isArray(metadataStore.tasks) ? metadataStore.tasks : []);
  const getPlayerLevels = () =>
    Array.isArray(metadataStore.playerLevels) ? metadataStore.playerLevels : [];
  const isTaskSuccessful = (taskId: string) =>
    (typeof tarkovStore.isTaskComplete === 'function'
      ? tarkovStore.isTaskComplete(taskId)
      : false) &&
    !(typeof tarkovStore.isTaskFailed === 'function' ? tarkovStore.isTaskFailed(taskId) : false);
  // Computed: Sum of XP from all completed tracked tasks
  const calculatedQuestXP = computed(() => {
    return getTasks()
      .filter((task) => isTaskSuccessful(task.id))
      .reduce((sum, task) => sum + (task.experience || 0), 0);
  });
  // Computed: User's total XP (calculated + offset)
  const totalXP = computed(() => {
    return (
      calculatedQuestXP.value +
      (typeof tarkovStore.getXpOffset === 'function' ? tarkovStore.getXpOffset() : 0)
    );
  });
  // Computed: Level derived from total XP
  const derivedLevel = computed(() => {
    const levels = getPlayerLevels();
    if (!levels || levels.length === 0) return 1;
    for (let i = levels.length - 1; i >= 0; i--) {
      const level = levels[i];
      if (level && totalXP.value >= level.exp) {
        return level.level;
      }
    }
    return 1;
  });
  // Computed: XP threshold for current level
  const xpForCurrentLevel = computed(() => {
    const levels = getPlayerLevels();
    const currentLevel = derivedLevel.value;
    const levelData = levels.find((l) => l.level === currentLevel);
    return levelData?.exp || 0;
  });
  // Computed: XP threshold for next level
  const xpForNextLevel = computed(() => {
    const levels = getPlayerLevels();
    const nextLevel = derivedLevel.value + 1;
    const levelData = levels.find((l) => l.level === nextLevel);
    return levelData?.exp || xpForCurrentLevel.value;
  });
  // Computed: Progress percentage to next level (0-100)
  const xpProgress = computed(() => {
    const current = xpForCurrentLevel.value;
    const next = xpForNextLevel.value;
    if (next <= current) return 100;
    return Math.min(100, Math.max(0, ((totalXP.value - current) / (next - current)) * 100));
  });
  // Computed: XP remaining to next level
  const xpToNextLevel = computed(() => {
    return Math.max(0, xpForNextLevel.value - totalXP.value);
  });
  // Action: Set total XP (calculates and stores offset)
  function setTotalXP(xp: number) {
    const offset = xp - calculatedQuestXP.value;
    if (typeof tarkovStore.setXpOffset === 'function') {
      tarkovStore.setXpOffset(offset);
    }
  }
  // Action: Set level (calculates XP from level threshold and stores offset)
  function setLevel(level: number) {
    const levels = getPlayerLevels();
    const levelData = levels.find((l) => l.level === level);
    if (levelData) {
      setTotalXP(levelData.exp);
    }
  }
  return {
    calculatedQuestXP,
    totalXP,
    derivedLevel,
    xpForCurrentLevel,
    xpForNextLevel,
    xpProgress,
    xpToNextLevel,
    setTotalXP,
    setLevel,
  };
}
