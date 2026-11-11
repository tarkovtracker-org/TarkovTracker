import snapshot from '@/data/extractRules.json';
import type { MapExtract } from '@/types/tarkov';
type Rule = {
  type: string;
  item?: string;
  count?: number;
  countPve?: number;
  vehicle?: boolean;
  slot?: string;
  percent?: number;
  percentPve?: number;
  min?: number;
  max?: number;
};
type Profile = { rules?: Rule[]; pvp?: Rule[]; seasonal?: Rule[]; extra?: Rule[] };
type Translate = (key: string, params?: Record<string, string | number>) => string;
export type ExtractRequirementTag = { key: string; label: string };
export type ExtractRequirements = {
  tags: ExtractRequirementTag[];
  details: string[];
  capturedAt?: string;
};
type Options = {
  mapId: string;
  extract: MapExtract;
  mode: string;
  t: Translate;
  itemName?: (id: string) => string | undefined;
};
const profiles: Record<string, Record<string, Profile>> = snapshot.maps;
const CURRENCY_KEYS: Record<string, string> = {
  '5449016a4bdc2d6f028b456f': 'rubles',
  '5696686a4bdc2da3298b456a': 'dollars',
  '569668774bdc2da2298b4568': 'euros',
};
const ITEM_KEYS: Record<string, string> = {
  '5c12688486f77426843c7d32': 'paracord',
  '5c0126f40db834002a125382': 'red_rebel',
  '591afe0186f77431bd616a11': 'zb014_key',
  '5448ba0b4bdc2d02308b456c': 'factory_key',
};
const text = (options: Options, key: string, params?: Record<string, string | number>) =>
  options.t(`maps.extract_requirements.${key}`, params);
function own<T>(record: Record<string, T> | undefined, key: string): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined;
}
function itemLabel(options: Options, id: string): string {
  const key = own(CURRENCY_KEYS, id) ?? own(ITEM_KEYS, id);
  if (key) return text(options, key);
  return options.itemName?.(id) ?? text(options, 'unknown_item', { id });
}
function capturedRules(profile: Profile | undefined, mode: string): Rule[] | undefined {
  if (!['pvp', 'pve', 'seasonal'].includes(mode)) return undefined;
  if (profile?.rules) return profile.rules;
  return mode === 'seasonal' ? profile?.seasonal : profile?.pvp;
}
function fallbackTransfer(extract: MapExtract): Rule[] {
  const transfer = extract.transferItem;
  if (!transfer || !Number.isFinite(transfer.count) || transfer.count <= 0) return [];
  const id = typeof transfer.item === 'string' ? transfer.item : transfer.item?.id;
  return id ? [{ type: 'transfer', item: id, count: transfer.count }] : [];
}
function payment(rule: Rule, options: Options): { tag: string; detail: string } {
  const count = options.mode === 'pve' ? (rule.countPve ?? rule.count) : rule.count;
  const currency = Boolean(own(CURRENCY_KEYS, rule.item ?? ''));
  return {
    tag: currency ? 'money' : 'transfer',
    detail: text(options, currency ? 'base_cost' : 'hand_over', {
      count: count ?? 0,
      item: itemLabel(options, rule.item ?? ''),
    }),
  };
}
function slotTag(slot?: string): string {
  if (slot === 'Backpack') return 'no_backpack';
  return slot === 'ArmorVest' ? 'no_armor' : 'restriction';
}
function ruleTag(rule: Rule): string {
  if (rule.type === 'empty') return slotTag(rule.slot);
  const tags: Record<string, string> = {
    item: 'gear',
    chance: 'conditional',
    green_flare: 'flare',
  };
  return own(tags, rule.type) ?? rule.type;
}
function slotLabel(rule: Rule, options: Options): string {
  if (rule.slot === 'Backpack') return text(options, 'backpack_slot');
  return rule.slot === 'ArmorVest'
    ? text(options, 'armor_slot')
    : (rule.slot ?? text(options, 'equipment_slot'));
}
function availability(rule: Rule, options: Options): number {
  const percent = options.mode === 'pve' ? (rule.percentPve ?? rule.percent) : rule.percent;
  return percent ?? 0;
}
const DETAIL_BUILDERS: Record<string, (rule: Rule, options: Options) => string> = {
  item: (rule, options) =>
    text(options, 'bring', { count: rule.count ?? 1, item: itemLabel(options, rule.item ?? '') }),
  key: (rule, options) =>
    text(options, 'key_detail', { item: itemLabel(options, rule.item ?? '') }),
  empty: (rule, options) => text(options, 'empty_slot', { slot: slotLabel(rule, options) }),
  chance: (rule, options) =>
    text(options, 'chance_detail', { percent: availability(rule, options) }),
};
function detail(rule: Rule, options: Options): string {
  const build = own(DETAIL_BUILDERS, rule.type);
  return build ? build(rule, options) : text(options, `${rule.type}_detail`);
}
function timingDetail(rule: Rule, options: Options): string {
  return text(options, 'window_detail', { min: rule.min ?? 0, max: rule.max ?? 0 });
}
function extraDetails(rule: Rule, options: Options): string[] {
  if (rule.vehicle) return [text(options, 'vehicle_detail')];
  return ['train', 'timer'].includes(rule.type) ? [timingDetail(rule, options)] : [];
}
function appendRule(
  rule: Rule,
  options: Options,
  addTag: (tag: string) => void,
  details: string[]
): void {
  if (rule.type === 'transfer') {
    const result = payment(rule, options);
    addTag(result.tag);
    details.push(result.detail);
  } else {
    addTag(ruleTag(rule));
    details.push(detail(rule, options));
  }
  if (rule.vehicle) addTag('conditional');
  details.push(...extraDetails(rule, options));
}
/** Combine captured rules with reviewed scene cues; absence never means an extract is open. */
export function getExtractRequirements(options: Options): ExtractRequirements {
  const profile = own(own(profiles, options.mapId), options.extract.id);
  const captured = capturedRules(profile, options.mode);
  const rules = [...(captured ?? [{ type: 'unknown' }]), ...(profile?.extra ?? [])];
  if (!rules.some((rule) => rule.type === 'transfer'))
    rules.push(...fallbackTransfer(options.extract));
  const tags = new Map<string, ExtractRequirementTag>();
  const details: string[] = [];
  const addTag = (key: string) => tags.set(key, { key, label: text(options, `tags.${key}`) });
  rules.forEach((rule) => appendRule(rule, options, addTag, details));
  if (!details.length) details.push(text(options, 'no_additional_data'));
  const source =
    options.mode === 'seasonal' ? snapshot.sources['pvp-season'] : snapshot.sources.pvp;
  return {
    tags: [...tags.values()],
    details,
    capturedAt: captured ? source.capturedAt : undefined,
  };
}
/** Plain DOM keeps Leaflet popups safe: upstream names and item labels are text, never HTML. */
export function createExtractDetails(
  name: string,
  requirements: ExtractRequirements,
  t: Translate
): HTMLElement {
  const panel = document.createElement('section');
  panel.className =
    'max-w-72 space-y-2 rounded-lg border border-surface-600 bg-surface-900 p-3 text-sm text-surface-100 shadow-xl';
  const title = document.createElement('h3');
  title.className = 'font-semibold';
  title.textContent = name;
  const list = document.createElement('ul');
  list.className = 'list-disc space-y-1 pl-4';
  for (const detail of requirements.details) {
    const item = document.createElement('li');
    item.textContent = detail;
    list.append(item);
  }
  const note = document.createElement('p');
  note.className = 'text-xs text-surface-400';
  note.textContent = t('maps.extract_requirements.raid_notice');
  panel.append(title, list, note);
  if (requirements.capturedAt) {
    const date = document.createElement('p');
    date.className = 'text-xs text-surface-400';
    date.textContent = t('maps.extract_requirements.reference_date', {
      date: requirements.capturedAt.slice(0, 10),
    });
    panel.append(date);
  }
  return panel;
}
/** Requirements stay visible independently of the zoom/hover-only name label. */
export function appendExtractRequirementTags(
  pin: HTMLElement,
  requirements: ExtractRequirements
): void {
  if (!requirements.tags.length) return;
  const badges = document.createElement('span');
  badges.className =
    'map-extract-requirements pointer-events-none absolute -top-2 left-5 flex w-max max-w-48 flex-wrap gap-0.5 rounded bg-surface-950/95 px-1 py-0.5 text-[10px] leading-tight font-semibold text-amber-200 shadow light:text-amber-900';
  for (const tag of requirements.tags) {
    const badge = document.createElement('span');
    badge.textContent = tag.label;
    badge.className = 'whitespace-nowrap px-0.5';
    badge.title = requirements.details.join(' ');
    badges.append(badge);
  }
  pin.append(badges);
  pin.setAttribute(
    'aria-label',
    `${pin.getAttribute('aria-label')}, ${requirements.tags.map((tag) => tag.label).join(', ')}`
  );
}
