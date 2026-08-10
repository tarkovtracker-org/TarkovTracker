interface FooterNavItemBase {
  label: string;
}
export type FooterNavItem =
  | (FooterNavItemBase & { to: string; onClick?: never })
  | (FooterNavItemBase & { onClick: () => void; to?: never });
