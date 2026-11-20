import { toTrustedGameLinkUrl } from '@/utils/externalUrl';
import { buildItemImageUrl, buildItemPageUrl } from '@/utils/tarkovUrls';
import type { TarkovItem } from '@/types/tarkov';
const BACKGROUND_CLASS_MAP: Record<string, string> & { default: string } = {
  violet: 'bg-rarity-violet',
  grey: 'bg-rarity-grey',
  yellow: 'bg-rarity-yellow',
  orange: 'bg-rarity-orange',
  green: 'bg-rarity-green',
  red: 'bg-rarity-red',
  black: 'bg-rarity-black',
  blue: 'bg-rarity-blue',
  default: 'bg-rarity-default',
};
const getItemIcon = (item?: TarkovItem | null) =>
  item?.iconLink || item?.image512pxLink || item?.image8xLink;
const getItemPreview = (item?: TarkovItem) =>
  item?.image512pxLink || item?.image8xLink || item?.iconLink;
export const getItemDisplayIcon = (item?: TarkovItem | null) =>
  getItemIcon(item?.properties?.defaultPreset) || getItemIcon(item);
export const getKeyIconSrc = (key: TarkovItem): string =>
  getItemDisplayIcon(key) || buildItemImageUrl(key.id, 'icon');
export const getKeyPreviewSrc = (key: TarkovItem): string =>
  getItemPreview(key.properties?.defaultPreset) ||
  key.image512pxLink ||
  buildItemImageUrl(key.id, '512');
export const getKeyBackgroundClass = (key: TarkovItem): string =>
  BACKGROUND_CLASS_MAP[(key.backgroundColor || 'default').toLowerCase()] ??
  BACKGROUND_CLASS_MAP.default;
export const getKeyDevUrl = (key: TarkovItem): string =>
  toTrustedGameLinkUrl(key.link) ?? buildItemPageUrl(key.id);
export const getKeyPrimaryUrl = (key: TarkovItem): string =>
  toTrustedGameLinkUrl(key.wikiLink) ?? getKeyDevUrl(key);
