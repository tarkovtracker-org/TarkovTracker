export interface PersonalModifier {
  id: string;
  incompatibleWith?: readonly string[];
  name: string;
  type: 'positive' | 'negative';
  points: number;
  description: string;
}
export interface HardcoreModifier {
  id: string;
  name: string;
  type: 'hardcore';
  description: string;
}
export type SeasonalModifier = PersonalModifier | HardcoreModifier;
export interface SeasonPlannerState {
  ownerUserId: string | null;
  selectedModifiers: string[];
}
