import {
  formatComparison,
  formatReputation,
  type RequirementTranslate,
} from '@/features/tasks/requirement-format';
import type { TraderRequirement } from '@/types/tarkov';
export function formatHideoutTraderRequirement(t: RequirementTranslate, req: TraderRequirement) {
  const reputation = req.requirementType === 'reputation';
  const key = reputation
    ? 'page.tasks.requirements.trader_reputation'
    : 'page.tasks.requirements.trader_level';
  const value = reputation ? formatReputation(req.value) : req.value;
  return t(key, {
    trader: req.trader.name,
    requirement: formatComparison(t, req.compareMethod, value),
  });
}
