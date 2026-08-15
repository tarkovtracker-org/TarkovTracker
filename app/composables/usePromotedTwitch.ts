export interface PromotedTwitchConfig {
  channel: string;
  displayName: string;
  enabled: boolean;
  version: number;
}
const sharedConfig = ref<PromotedTwitchConfig | null>(null);
export const usePromotedTwitch = () => {
  const applyConfig = (config: PromotedTwitchConfig): void => {
    sharedConfig.value = config;
  };
  const resetConfig = (): void => {
    sharedConfig.value = null;
  };
  return { config: readonly(sharedConfig), applyConfig, resetConfig };
};
