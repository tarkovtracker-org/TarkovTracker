export default defineNuxtPlugin({
  name: 'automatic-level-sync',
  dependsOn: ['supabase'],
  setup() {
    const metadataStore = useMetadataStore();
    const preferencesStore = usePreferencesStore();
    const tarkovStore = useTarkovStore();
    const { derivedLevel } = useXpCalculation();
    const getPlayerLevelsCount = () =>
      Array.isArray(metadataStore.playerLevels) ? metadataStore.playerLevels.length : 0;
    const getUseAutomaticLevelCalculation = () =>
      preferencesStore?.getUseAutomaticLevelCalculation ??
      preferencesStore?.useAutomaticLevelCalculation ??
      false;
    const getCurrentPlayerLevel = () =>
      typeof tarkovStore?.playerLevel === 'function' ? tarkovStore.playerLevel() : 0;
    const stopSync = watch(
      [getPlayerLevelsCount, getUseAutomaticLevelCalculation, derivedLevel],
      ([playerLevelsCount, useAutomaticLevel, nextDerivedLevel]) => {
        if (!useAutomaticLevel || playerLevelsCount === 0) {
          return;
        }
        if (
          getCurrentPlayerLevel() !== nextDerivedLevel &&
          typeof tarkovStore?.setLevel === 'function'
        ) {
          tarkovStore.setLevel(nextDerivedLevel);
        }
      },
      { immediate: true }
    );
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        stopSync();
      });
    }
  },
});
