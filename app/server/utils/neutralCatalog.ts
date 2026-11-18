import { isPlainObject } from '@/server/utils/deepMerge';
import { bindOverlayLocaleTargets, fetchNeutralOverlay } from '@/server/utils/neutralOverlay';
import { applyOverlay } from '@/server/utils/overlay';
import {
  projectEditions,
  projectRawPrestige,
  projectStoryChapters,
} from '@/server/utils/overlayProjectors';
import { adaptSeasonalPerks, projectSeasonalPerks } from '@/server/utils/seasonalPerks';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import {
  createTarkovJsonBootstrapFetcher,
  createTarkovJsonHideoutFetcher,
  createTarkovJsonItemsFetcher,
  createTarkovJsonMapSpawnsFetcher,
  createTarkovJsonPrestigeFetcher,
  createTarkovJsonTaskObjectivesFetcher,
  createTarkovJsonTaskRewardsFetcher,
  createTarkovJsonTasksCoreFetcher,
  fetchTarkovJsonEndpoint,
  fetchTarkovJsonStrings,
} from '@/server/utils/tarkov-json';
import { sanitizeTaskRewards } from '@/server/utils/tarkov-sanitization';
import { toTrustedGameLinkUrl } from '@/utils/externalUrl';
import { isGameDataString } from '@/utils/gameDataStrings';
import type { NeutralOverlaySnapshot } from '@/server/utils/neutralOverlay';
import type { OverlayMeta } from '@/server/utils/overlay';
import type { ValidGameMode } from '@/server/utils/tarkov-cache-config';
import type { TarkovJsonEndpoint, TarkovJsonOptions } from '@/server/utils/tarkov-json';
import type { CatalogDataset } from '@/utils/catalogDatasets';
export type NeutralCatalogPayload = {
  data: Record<string, unknown>;
  dataOverlay?: OverlayMeta;
};
type BuildOptions = { snapshot?: NeutralOverlaySnapshot; upstream?: TarkovJsonOptions };
const DATASET_ROWS: Record<CatalogDataset, string[]> = {
  bootstrap: ['playerLevels'],
  'tasks-core': ['tasks', 'maps', 'traders'],
  'tasks-objectives': ['tasks'],
  'tasks-rewards': ['tasks'],
  hideout: ['hideoutStations'],
  'items-lite': ['items'],
  items: ['items'],
  'map-spawns': ['maps'],
  prestige: ['prestige'],
  editions: ['editions', 'storyChapters'],
};
function assertCatalogRows(
  dataset: CatalogDataset,
  value: unknown
): asserts value is NeutralCatalogPayload {
  const payload = value as NeutralCatalogPayload;
  if (
    !DATASET_ROWS[dataset].every(
      (key) => Array.isArray(payload.data?.[key]) && (payload.data[key] as unknown[]).length > 0
    )
  )
    throw new Error(`Invalid or empty ${dataset} source catalog`);
}
const datasetFetchers = {
  bootstrap: createTarkovJsonBootstrapFetcher,
  'tasks-core': createTarkovJsonTasksCoreFetcher,
  'tasks-objectives': createTarkovJsonTaskObjectivesFetcher,
  'tasks-rewards': (options: TarkovJsonOptions) => async () =>
    sanitizeTaskRewards(await createTarkovJsonTaskRewardsFetcher(options)()),
  hideout: createTarkovJsonHideoutFetcher,
  'items-lite': (options: TarkovJsonOptions) =>
    createTarkovJsonItemsFetcher(options, { lite: true }),
  items: createTarkovJsonItemsFetcher,
  'map-spawns': createTarkovJsonMapSpawnsFetcher,
};
async function editionsCatalog(
  snapshot: NeutralOverlaySnapshot,
  gameMode: ValidGameMode,
  options: TarkovJsonOptions
): Promise<NeutralCatalogPayload> {
  const perks =
    gameMode === 'pvp-season'
      ? adaptSeasonalPerks(await fetchTarkovJsonEndpoint('season', options))
      : [];
  return {
    data: {
      editions: projectEditions(snapshot.overlay, gameMode),
      storyChapters: projectStoryChapters(snapshot.overlay, gameMode, 'en'),
      seasonalPerks: projectSeasonalPerks(snapshot.overlay, gameMode, perks),
    },
    dataOverlay: snapshot.meta,
  };
}
/** Build once per mode. Only declared translatable fields acquire translation references. */
export async function buildNeutralCatalog(
  dataset: CatalogDataset,
  gameMode: ValidGameMode,
  build: BuildOptions = {}
): Promise<NeutralCatalogPayload> {
  const options = { ...build.upstream, gameMode, neutral: true };
  if (dataset === 'bootstrap' || dataset === 'map-spawns') {
    const response = await datasetFetchers[dataset](options)();
    assertCatalogRows(dataset, response);
    return response;
  }
  const snapshot = build.snapshot ?? (await fetchNeutralOverlay());
  if (dataset === 'editions') {
    const response = await editionsCatalog(snapshot, gameMode, options);
    assertCatalogRows(dataset, response);
    return bindOverlayLocaleTargets(response, snapshot, gameMode, true);
  }
  if (dataset === 'prestige') {
    const response = await createTarkovJsonPrestigeFetcher({
      ...options,
      project: (payload) => {
        if (!Array.isArray(payload.prestige) && !isPlainObject(payload.prestige))
          throw new Error('Invalid prestige source catalog');
        const corrected = projectRawPrestige(payload, snapshot.overlay, gameMode, 'en');
        return bindOverlayLocaleTargets({ data: corrected }, snapshot, gameMode).data;
      },
    })();
    if (gameMode !== 'pvp-season') assertCatalogRows(dataset, response);
    return bindOverlayLocaleTargets(
      { ...response, dataOverlay: snapshot.meta },
      snapshot,
      gameMode
    ) as unknown as NeutralCatalogPayload;
  }
  const payload = await datasetFetchers[dataset](options)();
  assertCatalogRows(dataset, payload);
  const response = await applyOverlay(payload, {
    gameMode,
    locale: 'en',
    snapshot,
    text: {
      resolve: (value) => snapshot.strings.en?.[value] ?? value,
      itemDescription: (name) => `@tt:template:hand-over:${encodeURIComponent(name)}`,
    },
  });
  const ownsOptionalFields = dataset !== 'tasks-objectives' && dataset !== 'tasks-rewards';
  return bindOverlayLocaleTargets(
    response,
    snapshot,
    gameMode,
    ownsOptionalFields
  ) as unknown as NeutralCatalogPayload;
}
type SourceReference = { mode: ValidGameMode; endpoint: TarkovJsonEndpoint; key: string };
const ENDPOINTS = new Set(['hideout', 'items', 'maps', 'season', 'tasks', 'traders']);
function upstreamReference(token: string): SourceReference | undefined {
  const [, mode, endpoint, ...key] = token.split(':');
  if (
    !VALID_GAME_MODES.includes(mode as ValidGameMode) ||
    !ENDPOINTS.has(endpoint ?? '') ||
    !key.length
  )
    return undefined;
  return {
    mode: mode as ValidGameMode,
    endpoint: endpoint as TarkovJsonEndpoint,
    key: key.join(':'),
  };
}
type OverrideReference = { key: string; fallback: string };
function overrideReference(token: string): OverrideReference | undefined {
  if (!token.startsWith('@tt:override:')) return undefined;
  const parts = token.split(':');
  if (parts.length !== 5 || !VALID_GAME_MODES.includes(parts[2] as ValidGameMode))
    throw new Error('Invalid overlay override reference');
  return { key: decodeURIComponent(parts[3]!), fallback: decodeURIComponent(parts[4]!) };
}
const readText = (table: Record<string, unknown> | undefined, key: string): string | undefined =>
  table && Object.hasOwn(table, key) && typeof table[key] === 'string' ? table[key] : undefined;
function missingTranslationTable(error: unknown): Record<string, unknown> {
  const failure = error as { statusCode?: number; response?: { status?: number } } | null;
  if (failure?.statusCode === 404 || failure?.response?.status === 404) return {};
  throw error;
}
const trustedLinkText = (text: string): string => toTrustedGameLinkUrl(text) ?? '';
const overlayText = (key: string, text: string): string =>
  key.endsWith('/wikiLink') ? trustedLinkText(text) : text;
function requireText(
  primary: Record<string, unknown> | undefined,
  fallback: Record<string, unknown> | undefined,
  key: string
): string {
  const text = readText(primary, key) ?? readText(fallback, key);
  if (text === undefined) throw new Error(`Missing game data string ${key}`);
  return text;
}
/** Resolve one bundle for all modes while retaining upstream source and mode distinctions. */
export async function buildCatalogStrings(
  lang: string,
  referenced: Set<string>,
  build: BuildOptions = {}
): Promise<{ data: { strings: Record<string, string> }; dataOverlay: OverlayMeta }> {
  const snapshot = build.snapshot ?? (await fetchNeutralOverlay());
  const tables = new Map<string, Promise<Record<string, unknown>>>();
  const table = (ref: SourceReference, language: string) => {
    const identity = `${ref.mode}/${ref.endpoint}/${language}`;
    let pending = tables.get(identity);
    if (!pending) {
      pending = fetchTarkovJsonStrings(ref.endpoint, {
        ...build.upstream,
        gameMode: ref.mode,
        lang: language,
      });
      tables.set(identity, pending);
    }
    return pending;
  };
  const resolved = new Map<string, Promise<string>>();
  const resolve = (token: string): Promise<string> => {
    const existing = resolved.get(token);
    if (existing) return existing;
    const pending = resolveToken(token);
    resolved.set(token, pending);
    return pending;
  };
  const resolveValue = (value: string): Promise<string> =>
    isGameDataString(value) ? resolve(value) : Promise.resolve(value);
  const resolveTemplate = async (token: string): Promise<string> => {
    const templatePrefix = '@tt:template:hand-over:';
    if (!token.startsWith(templatePrefix)) throw new Error('Unknown game data string template');
    const name = decodeURIComponent(token.slice(templatePrefix.length));
    return `Hand over the found in raid item: ${await resolveValue(name)}`;
  };
  const resolveOverride = async (token: string): Promise<string> => {
    const override = overrideReference(token);
    if (!override) throw new Error('Invalid overlay override reference');
    const corrected =
      readText(snapshot.strings[lang], override.key) ?? readText(snapshot.strings.en, override.key);
    return corrected === undefined
      ? resolveValue(override.fallback)
      : overlayText(override.key, corrected);
  };
  const resolveOverlay = async (token: string): Promise<string> =>
    overlayText(token, requireText(snapshot.strings[lang], snapshot.strings.en, token));
  const resolveUpstream = async (token: string): Promise<string> => {
    const ref = upstreamReference(token);
    if (!ref) throw new Error(`Invalid game data string ${token}`);
    const english = table(ref, 'en');
    const primary = lang === 'en' ? english : table(ref, lang).catch(missingTranslationTable);
    const [localized, fallback] = await Promise.all([primary, english]);
    return requireText(localized, fallback, ref.key);
  };
  const resolvers: Record<string, (token: string) => Promise<string>> = {
    template: resolveTemplate,
    override: resolveOverride,
    overlay: resolveOverlay,
    link: async (token) => trustedLinkText(await resolve(`@tt:${token.slice(9)}`)),
  };
  const resolveToken = (token: string): Promise<string> => {
    const handler = resolvers[token.split(':')[1] ?? ''];
    return handler ? handler(token) : resolveUpstream(token);
  };
  const entries = await Promise.all(
    [...referenced].map(async (token) => [token, await resolve(token)])
  );
  return { data: { strings: Object.fromEntries(entries) }, dataOverlay: snapshot.meta };
}
