export type SeasonalModifierType = 'hardcore' | 'positive' | 'negative';
export interface SeasonalModifier {
  id: string;
  name: string;
  type: SeasonalModifierType;
  points: number | null;
  description: string;
}
export interface SeasonPlannerState {
  selectedModifiers: string[];
}
