export interface CreditMember {
  contributions?: number;
  name: string;
  avatar?: string;
  link?: string;
}
export type CreditMemberVariant = 'row' | 'grid';
