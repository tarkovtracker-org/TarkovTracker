import snapshot from '@/data/extractRules.json';
import {
  createMapIconSvg,
  MAP_REQUIREMENT_ICON_PATHS,
  MAP_REQUIREMENT_LEGEND_KEYS,
} from '@/features/maps/utils/mapIcons';
import type { MapExtract } from '@/types/tarkov';
type Rule = {
  type: string;
  item?: string;
  itemName?: string;
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
/** One popup row: the requirement's icon, a short instruction and an optional qualifier. */
export type ExtractRequirementDetail = { tag?: string; text: string; hint?: string };
type TaggedDetail = ExtractRequirementDetail & { tag: string };
export type ExtractRequirements = {
  tags: ExtractRequirementTag[];
  details: ExtractRequirementDetail[];
};
/** Where a map's requirement rules come from, shown once per map instead of in every popup. */
export type ExtractDataSource = {
  capturedAt: string;
  /** Four-part game version, e.g. `1.3.0.0`; the build number stays in `clientBuild`. */
  clientVersion: string;
  clientBuild: string;
  /** Some rules on this map are curated scene cues rather than game definitions. */
  curatedCues: boolean;
};
type Options = {
  mapId: string;
  extract: MapExtract;
  mode: string;
  t: Translate;
  itemName?: (id: string) => string | undefined;
  /** Formats counts in the app's selected locale; defaults to the runtime locale. */
  formatNumber?: (count: number) => string;
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
const formatCount = (options: Options, count: number): string =>
  (options.formatNumber ?? new Intl.NumberFormat().format)(count);
/** Seconds after raid start as m:ss, the way the in-raid timer reads. */
const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
function own<T>(record: Record<string, T> | undefined, key: string): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined;
}
function itemLabel(options: Options, id: string, suppliedName?: string): string {
  const key = own(CURRENCY_KEYS, id) ?? own(ITEM_KEYS, id);
  if (key) return text(options, key);
  return suppliedName ?? options.itemName?.(id) ?? text(options, 'unknown_item', { id });
}
function capturedRules(profile: Profile | undefined, mode: string): Rule[] | undefined {
  if (!SUPPORTED_MODES.includes(mode)) return undefined;
  if (profile?.rules) return profile.rules;
  return mode === 'seasonal' ? profile?.seasonal : profile?.pvp;
}
function fallbackTransfer(extract: MapExtract): Rule[] {
  const transfer = extract.transferItem;
  if (!transfer || !Number.isFinite(transfer.count) || transfer.count <= 0) return [];
  return transferRule(transfer);
}
function nonBlankString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}
function transferRule(transfer: NonNullable<MapExtract['transferItem']>): Rule[] {
  const item = typeof transfer.item === 'string' ? { id: transfer.item } : transfer.item;
  const id = nonBlankString(item?.id);
  return id
    ? [
        {
          type: 'transfer',
          item: id,
          itemName: nonBlankString(item?.name),
          count: transfer.count,
        },
      ]
    : [];
}
function payment(rule: Rule, options: Options): TaggedDetail {
  const count = options.mode === 'pve' ? (rule.countPve ?? rule.count) : rule.count;
  const currency = Boolean(own(CURRENCY_KEYS, rule.item ?? ''));
  return {
    tag: currency ? 'money' : 'transfer',
    text: text(options, currency ? 'base_cost' : 'hand_over', {
      count: formatCount(options, count ?? 0),
      item: itemLabel(options, rule.item ?? '', rule.itemName),
    }),
    hint: currency ? text(options, 'base_cost_hint') : undefined,
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
    text(options, 'bring', {
      count: formatCount(options, rule.count ?? 1),
      item: itemLabel(options, rule.item ?? ''),
    }),
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
/** Trains and timed extracts carry their configured window as the row's qualifier. */
function timingHint(rule: Rule, options: Options): string | undefined {
  if (!['train', 'timer'].includes(rule.type) || rule.max === undefined) return undefined;
  return text(options, 'window_detail', { min: clock(rule.min ?? 0), max: clock(rule.max) });
}
function ruleDetail(rule: Rule, options: Options): TaggedDetail {
  return { tag: ruleTag(rule), text: detail(rule, options), hint: timingHint(rule, options) };
}
function appendRule(
  rule: Rule,
  options: Options,
  addTag: (tag: string) => void,
  details: ExtractRequirementDetail[]
): void {
  const entry = rule.type === 'transfer' ? payment(rule, options) : ruleDetail(rule, options);
  addTag(entry.tag);
  details.push(entry);
  if (!rule.vehicle) return;
  addTag('conditional');
  details.push({ tag: 'conditional', text: text(options, 'vehicle_detail') });
}
/** Combine captured rules with reviewed scene cues; absence never means an extract is open. */
export function getExtractRequirements(options: Options): ExtractRequirements {
  const profile = own(own(profiles, options.mapId), options.extract.id);
  const captured = capturedRules(profile, options.mode);
  const rules = [...(captured ?? [{ type: 'unknown' }]), ...(profile?.extra ?? [])];
  if (!rules.some((rule) => rule.type === 'transfer'))
    rules.push(...fallbackTransfer(options.extract));
  const tags = new Map<string, ExtractRequirementTag>();
  const details: ExtractRequirementDetail[] = [];
  const addTag = (key: string) => tags.set(key, { key, label: text(options, `tags.${key}`) });
  rules.forEach((rule) => appendRule(rule, options, addTag, details));
  if (!details.length) details.push({ text: text(options, 'no_additional_data') });
  return { tags: [...tags.values()], details };
}
const SUPPORTED_MODES = ['pvp', 'pve', 'seasonal'];
/** PvE reads the regular definitions' PvE fields, so it shares the regular capture. */
function modeSource(mode: string) {
  return mode === 'seasonal' ? snapshot.sources['pvp-season'] : snapshot.sources.pvp;
}
/** The game capture behind a map's requirement rules; undefined when the map has none. */
export function getExtractDataSource(mapId: string, mode: string): ExtractDataSource | undefined {
  const mapProfiles = own(profiles, mapId);
  if (!mapProfiles || !SUPPORTED_MODES.includes(mode)) return undefined;
  const source = modeSource(mode);
  const build = source.version.replace(/^EFT Client\s*/, '');
  return {
    capturedAt: source.capturedAt,
    clientVersion: build.split('.').slice(0, 4).join('.'),
    clientBuild: build,
    curatedCues: Object.values(mapProfiles).some((profile) => Boolean(profile.extra?.length)),
  };
}
/**
 * The visible source line and its fuller hover text. Curated cues are named whenever the map uses
 * any, so game definitions and third-party additions are never presented as one source.
 */
export function describeExtractSource(
  source: ExtractDataSource,
  t: Translate,
  formatDate: (iso: string) => string
): { label: string; detail: string } {
  const key = source.curatedCues ? 'source_curated' : 'source';
  const detail = [t('maps.extract_requirements.source_detail', { build: source.clientBuild })];
  if (source.curatedCues) detail.push(t('maps.extract_requirements.curated_detail'));
  return {
    label: t(`maps.extract_requirements.${key}`, {
      version: source.clientVersion,
      date: formatDate(source.capturedAt),
    }),
    detail: detail.join(' '),
  };
}
const POPUP_ICON_CLASS = 'mt-px size-4 shrink-0 text-amber-300 light:text-amber-700';
/** Leaflet styles `p` inside popups with large margins, so popup text uses plain blocks. */
function textBlock(className: string, content: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = content;
  return element;
}
function detailRow(entry: ExtractRequirementDetail): HTMLLIElement {
  const row = document.createElement('li');
  row.className = 'flex items-start gap-2';
  const path = own(MAP_REQUIREMENT_ICON_PATHS, entry.tag ?? '');
  if (path) row.append(createMapIconSvg(path, POPUP_ICON_CLASS));
  const body = document.createElement('div');
  body.className = 'min-w-0';
  body.append(textBlock('text-[13px] leading-snug text-surface-100', entry.text));
  if (entry.hint) body.append(textBlock('text-xs leading-snug text-surface-400', entry.hint));
  row.append(body);
  return row;
}
/**
 * Compact click-through details: the name and one icon row per requirement. The source and the
 * not-live notice are shown once per map, not in each popup. Plain DOM keeps Leaflet popups safe:
 * upstream names and item labels are text, never HTML.
 */
export function createExtractDetails(name: string, requirements: ExtractRequirements): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'text-sm';
  const title = document.createElement('h3');
  title.className = 'm-0 pr-5 text-sm leading-tight font-semibold text-surface-100';
  title.textContent = name;
  const list = document.createElement('ul');
  list.className = 'mt-2 space-y-1.5';
  list.append(...requirements.details.map(detailRow));
  panel.append(title, list);
  return panel;
}
/** Icons beyond this count collapse into "+N"; the popup always lists every requirement. */
const MAX_PIN_ICONS = 3;
const legendRank = (key: string): number => {
  const rank = (MAP_REQUIREMENT_LEGEND_KEYS as readonly string[]).indexOf(key);
  return rank < 0 ? MAP_REQUIREMENT_LEGEND_KEYS.length : rank;
};
function overflowCount(hidden: number): HTMLElement[] {
  if (hidden < 1) return [];
  const more = document.createElement('span');
  more.className = 'px-px text-[10px] leading-none font-bold';
  more.textContent = `+${hidden}`;
  return [more];
}
function requirementIcons(tags: ExtractRequirementTag[]): HTMLElement {
  const strip = document.createElement('span');
  strip.className =
    'map-extract-requirements inline-flex h-4.5 shrink-0 items-center gap-0.5 rounded-full bg-black/85 px-1 text-amber-300 shadow-[0_1px_3px_rgba(0,0,0,0.7)] ring-1 ring-white/25';
  strip.dataset.tags = tags.map((tag) => tag.key).join(' ');
  strip.title = tags.map((tag) => tag.label).join(', ');
  const icons = tags
    .slice(0, MAX_PIN_ICONS)
    .map((tag) =>
      createMapIconSvg(
        own(MAP_REQUIREMENT_ICON_PATHS, tag.key) ?? MAP_REQUIREMENT_ICON_PATHS.unknown!,
        'size-3 shrink-0'
      )
    );
  strip.append(...icons, ...overflowCount(tags.length - MAX_PIN_ICONS));
  return strip;
}
/**
 * Always-visible requirement icons beside the pin head, ahead of the on-demand name label, in
 * legend order. `redundant` skips requirements the pin glyph already shows (the co-op handshake).
 */
export function appendExtractRequirementTags(
  pin: HTMLElement,
  requirements: ExtractRequirements,
  redundant: string[] = []
): void {
  if (!requirements.tags.length) return;
  const shown = requirements.tags
    .filter((tag) => !redundant.includes(tag.key))
    .sort((a, b) => legendRank(a.key) - legendRank(b.key));
  if (shown.length) (pin.querySelector('.map-pin-side') ?? pin).prepend(requirementIcons(shown));
  pin.setAttribute(
    'aria-label',
    `${pin.getAttribute('aria-label')}, ${requirements.tags.map((tag) => tag.label).join(', ')}`
  );
}
