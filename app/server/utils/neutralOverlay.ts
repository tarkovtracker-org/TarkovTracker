import { isPlainObject } from '@/server/utils/deepMerge';
import { overlayAuthHeaders } from '@/server/utils/overlayAuth';
import { validateOverlayData, unknownOverlaySections } from '@/server/utils/overlayValidation';
import { TARKOVTRACKER_USER_AGENT } from '@/server/utils/userAgent';
import { overlayOverrideKey } from '@/utils/gameDataStrings';
import type { OverlayMeta } from '@/server/utils/overlay';
import type { OverlayData } from '@/server/utils/overlayTypes';
type Identity = { version: string; generated: string; sha256: string };
export type NeutralOverlaySnapshot = {
  overlay: OverlayData;
  meta: OverlayMeta;
  strings: Record<string, Record<string, string>>;
  localeTargets: Record<string, string[]>;
};
const DEFAULT_URL =
  'https://raw.githubusercontent.com/tarkovtracker-org/tarkov-data-overlay/main/dist/overlay-neutral.json';
const TTL = 60 * 60 * 1000;
let cached: { snapshot: NeutralOverlaySnapshot; fetchedAt: number } | undefined;
let pending: Promise<NeutralOverlaySnapshot> | undefined;
const validIdentity = (value: unknown): value is Identity =>
  isPlainObject(value) &&
  ['version', 'generated', 'sha256'].every(
    (field) => typeof value[field] === 'string' && String(value[field]).length > 0
  );
const validStrings = (value: unknown): value is NeutralOverlaySnapshot['strings'] =>
  isPlainObject(value) &&
  Object.values(value).every(
    (table) =>
      isPlainObject(table) && Object.values(table).every((text) => typeof text === 'string')
  );
// Match the overlay producer's locale-override schema, including ID-keyed objective text.
const LOCALE_FIELDS = new Map<string, ReadonlySet<string>>([
  ['items', new Set(['description', 'name', 'shortName', 'wikiLink'])],
  ['maps', new Set(['description', 'name'])],
  ['prestige', new Set(['name'])],
  ['storyChapters', new Set(['description', 'name'])],
  ['tasks', new Set(['name', 'wikiLink'])],
  ['traders', new Set(['description', 'name'])],
]);
const safeTargetPart = (part: unknown): part is string =>
  typeof part === 'string' && !['__proto__', 'constructor', 'prototype'].includes(part);
const safeTargetPath = (path: unknown): path is string[] =>
  Array.isArray(path) && path.length >= 3 && path.every(safeTargetPart);
const flatLocaleTarget = (path: string[]): boolean =>
  path.length === 3 && (LOCALE_FIELDS.get(path[0]!)?.has(path[2]!) ?? false);
const objectiveLocaleTarget = (path: string[]): boolean =>
  path.length === 5 &&
  ['tasks', 'storyChapters'].includes(path[0]!) &&
  path[2] === 'objectives' &&
  path[4] === 'description';
const targetKey = (path: string[]): string =>
  `@tt:overlay:/${path.map((part) => part.replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`;
const validTarget = (key: string, path: unknown): boolean =>
  safeTargetPath(path) &&
  (flatLocaleTarget(path) || objectiveLocaleTarget(path)) &&
  key === targetKey(path);
const validTargets = (value: unknown): value is NeutralOverlaySnapshot['localeTargets'] =>
  isPlainObject(value) && Object.entries(value).every(([key, path]) => validTarget(key, path));
export async function parseNeutralOverlay(
  value: unknown,
  sourceUrl = DEFAULT_URL
): Promise<NeutralOverlaySnapshot> {
  if (!isPlainObject(value) || value.schemaVersion !== 1)
    throw new Error('Unsupported neutral overlay schema');
  if (!validIdentity(value.$meta) || !validIdentity(value.$source))
    throw new Error('Missing neutral overlay identity');
  if (!validStrings(value.$strings) || !validTargets(value.$localeTargets))
    throw new Error('Invalid neutral overlay strings');
  const unsigned = { ...value, $meta: { ...value.$meta } };
  delete (unsigned.$meta as Partial<Identity>).sha256;
  const bytes = new TextEncoder().encode(JSON.stringify(unsigned, null, 2));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)]
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('');
  if (hash !== value.$meta.sha256) throw new Error('Neutral overlay digest mismatch');
  const { schemaVersion: _schema, $strings, $localeTargets, $source, ...sections } = value;
  const overlay = { ...sections, $meta: $source };
  if (!validateOverlayData(overlay) || unknownOverlaySections(overlay).length)
    throw new Error('Invalid neutral overlay sections');
  return {
    overlay,
    strings: $strings,
    localeTargets: $localeTargets,
    meta: { ...$source, status: 'fresh', sourceUrl },
  };
}
const neutralUrl = (): string => {
  const url = new URL(process.env.NEUTRAL_OVERLAY_URL || DEFAULT_URL);
  if (url.protocol !== 'https:') throw new Error('Neutral overlay requires HTTPS');
  return url.href;
};
async function loadNeutralOverlay(): Promise<NeutralOverlaySnapshot> {
  let url = neutralUrl();
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
      headers: {
        Accept: 'application/json',
        'User-Agent': TARKOVTRACKER_USER_AGENT,
        ...overlayAuthHeaders(url),
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const target = new URL(response.headers.get('location') ?? '', url);
      await response.body?.cancel();
      if (target.protocol !== 'https:') throw new Error('Insecure neutral overlay redirect');
      url = target.href;
      continue;
    }
    if (!response.ok) throw new Error(`Neutral overlay unavailable (${response.status})`);
    return parseNeutralOverlay(await response.json(), url);
  }
  throw new Error('Neutral overlay redirect limit exceeded');
}
export async function fetchNeutralOverlay(bypassCache = false): Promise<NeutralOverlaySnapshot> {
  if (!bypassCache && cached && Date.now() - cached.fetchedAt < TTL) return cached.snapshot;
  if (pending) return pending;
  pending = loadNeutralOverlay().then((snapshot) => {
    cached = { snapshot, fetchedAt: Date.now() };
    return snapshot;
  });
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
type PathReplacement = { replace: (old: string) => string; addMissingFields: boolean };
function arrayPathIndex(value: unknown[], part: string): number {
  const identified = value.findIndex((entry) => isPlainObject(entry) && entry.id === part);
  if (identified >= 0) return identified;
  return /^\d+$/.test(part) ? Number(part) : -1;
}
function replaceArrayPath(value: unknown[], path: string[], update: PathReplacement): unknown[] {
  const [part, ...rest] = path;
  const index = arrayPathIndex(value, part!);
  return value.map((entry, offset) =>
    offset === index ? replaceAtPath(entry, rest, update) : entry
  );
}
const missingField = (
  value: Record<string, unknown>,
  path: string[],
  update: PathReplacement
): unknown =>
  update.addMissingFields && path.length === 1
    ? { ...value, [path[0]!]: update.replace('') }
    : value;
function replaceObjectPath(
  value: Record<string, unknown>,
  path: string[],
  update: PathReplacement
): unknown {
  const [part, ...rest] = path;
  if (!Object.hasOwn(value, part!)) return missingField(value, path, update);
  return { ...value, [part!]: replaceAtPath(value[part!], rest, update) };
}
const replaceStringLeaf = (value: unknown, replace: PathReplacement['replace']): unknown =>
  typeof value === 'string' ? replace(value) : value;
function replaceAtPath(value: unknown, path: string[], update: PathReplacement): unknown {
  if (!path.length) return replaceStringLeaf(value, update.replace);
  if (Array.isArray(value)) return replaceArrayPath(value, path, update);
  return isPlainObject(value) ? replaceObjectPath(value, path, update) : value;
}
/** Locale-only corrections capture the original mode-specific value as their English fallback. */
export function bindOverlayLocaleTargets<T>(
  value: T,
  snapshot: NeutralOverlaySnapshot,
  mode: string,
  addMissingFields = false
): T {
  return Object.entries(snapshot.localeTargets).reduce<unknown>(
    (current, [key, path]) =>
      replaceAtPath(current, ['data', ...path], {
        replace: (old) => (old === key ? key : overlayOverrideKey(mode, key, old)),
        addMissingFields,
      }),
    value
  ) as T;
}
