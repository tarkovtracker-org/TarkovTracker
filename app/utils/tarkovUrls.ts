/**
 * Tarkov.dev URL builders - centralized utilities for generating tarkov.dev URLs
 */
const TARKOV_DEV_ASSETS_BASE = 'https://assets.tarkov.dev';
const TARKOV_DEV_SITE_BASE = 'https://tarkov.dev';
export type ItemImageSize = '512' | 'icon' | 'grid' | 'base' | '8x';
const suffixMap: Readonly<Record<ItemImageSize, string>> = {
  '512': '-512.webp',
  icon: '-icon.webp',
  grid: '-grid-image.webp',
  base: '-base-image.webp',
  '8x': '-8x.webp',
};
/**
 * Build a URL for an item image from the tarkov.dev CDN
 * @param itemId - The item ID
 * @param size - Image size variant (default: '512')
 * @returns Full URL to the item image
 */
export function buildItemImageUrl(itemId: string, size: ItemImageSize = '512'): string {
  return `${TARKOV_DEV_ASSETS_BASE}/${encodeURIComponent(itemId)}${suffixMap[size]}`;
}
/**
 * Build a URL for an item's detail page on tarkov.dev
 * @param itemId - The item ID
 * @returns Full URL to the item page
 */
export function buildItemPageUrl(itemId: string): string {
  return `${TARKOV_DEV_SITE_BASE}/item/${encodeURIComponent(itemId)}`;
}
/**
 * Build a URL for a task's detail page on tarkov.dev
 * @param taskId - The task ID
 * @returns Full URL to the task page
 */
export function buildTaskPageUrl(taskId: string): string {
  return `${TARKOV_DEV_SITE_BASE}/task/${encodeURIComponent(taskId)}`;
}
/**
 * Build a URL for a skill icon from the tarkov.dev CDN
 * @param skillId - The skill ID (matches the json.tarkov.dev skill string)
 * @returns Full URL to the skill icon image
 */
export function buildSkillImageUrl(skillId: string): string {
  return `${TARKOV_DEV_ASSETS_BASE}/skill-${encodeURIComponent(skillId)}-icon.webp`;
}
