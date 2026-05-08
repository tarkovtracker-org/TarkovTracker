export type BillingInterval = 'monthly' | '6month' | 'yearly';
export interface SupporterTier {
  id: 'scav' | 'timmy' | 'chad';
  baseMonthly: number;
  featured?: boolean;
}
