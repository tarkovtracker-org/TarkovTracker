import { TRADERS_WITHOUT_LOYALTY_LEVELS, TRADERS_WITHOUT_REPUTATION } from '@/utils/constants';
import type { Trader } from '@/types/tarkov';
export const hasTraderLoyalty = (trader: Trader) =>
  !TRADERS_WITHOUT_LOYALTY_LEVELS.some((name) => name === trader.normalizedName);
export const hasTraderReputation = (trader: Trader) =>
  !TRADERS_WITHOUT_REPUTATION.some((name) => name === trader.normalizedName);
export function traderReputationMinimum(trader: Trader, level: number) {
  const required = trader.levels?.find((entry) => entry.level === level)?.requiredReputation;
  if (level <= 1 || !required || !Number.isFinite(required)) return 0;
  return Math.max(0, Math.ceil(required * 100 - 1e-9) / 100);
}
