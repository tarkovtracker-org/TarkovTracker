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
export const getKeyIconSrc = (key: TarkovItem): string =>
  key.iconLink || buildItemImageUrl(key.id, 'icon');
export const getKeyPreviewSrc = (key: TarkovItem): string =>
  key.image512pxLink || buildItemImageUrl(key.id, '512');
export const getKeyBackgroundClass = (key: TarkovItem): string =>
  BACKGROUND_CLASS_MAP[(key.backgroundColor || 'default').toLowerCase()] ??
  BACKGROUND_CLASS_MAP.default;
export const getKeyDevUrl = (key: TarkovItem): string => key.link || buildItemPageUrl(key.id);
export const getKeyPrimaryUrl = (key: TarkovItem): string => key.wikiLink || getKeyDevUrl(key);
