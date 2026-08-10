import type { CreditMemberVariant } from '@/features/credits/types';
const BASE_CLASSES: Record<CreditMemberVariant, string> = {
  row: 'flex min-h-12 items-center gap-3 rounded-md bg-white/5 px-4 py-2.5 text-base font-medium text-white',
  grid: 'group flex min-h-8 items-center gap-2 rounded px-2 py-1 text-sm text-white/85',
};
const LINK_HOVER_CLASSES: Record<CreditMemberVariant, string> = {
  row: 'hover:bg-white/10 hover:text-primary-100',
  grid: 'hover:bg-white/5 hover:text-white',
};
export const creditMemberAvatarSize = (variant: CreditMemberVariant) =>
  variant === 'row' ? 36 : 28;
export const creditMemberAvatarClasses = (variant: CreditMemberVariant) => {
  const size = variant === 'row' ? 'h-9 w-9' : 'h-7 w-7';
  return `${size} shrink-0 rounded-full border border-white/15 object-cover`;
};
export const creditMemberClasses = (variant: CreditMemberVariant, linked: boolean) => [
  BASE_CLASSES[variant],
  linked
    ? [
        LINK_HOVER_CLASSES[variant],
        'focus-visible:ring-primary-500 transition-colors focus-visible:ring-2 focus-visible:outline-none',
      ].join(' ')
    : '',
];
