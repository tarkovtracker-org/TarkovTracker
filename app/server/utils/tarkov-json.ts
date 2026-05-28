import { JSONPath } from 'jsonpath-plus';
import { $fetch } from 'ofetch';
import { useRuntimeConfig } from '#imports';
import { createLogger } from '@/server/utils/logger';
import type { ValidGameMode } from '@/server/utils/tarkov-cache-config';
import type {
  FinishRewards,
  HideoutStation,
  PlayerLevel,
  PrestigeLevel,
  TarkovBootstrapQueryResult,
  TarkovHideoutQueryResult,
  TarkovItem,
  TarkovItemsQueryResult,
  TarkovMap,
  TarkovMapSpawnsQueryResult,
  TarkovPrestigeQueryResult,
  TarkovTaskObjectivesQueryResult,
  TarkovTaskRewardsQueryResult,
  TarkovTasksCoreQueryResult,
  Task,
  TaskObjective,
  Trader,
} from '@/types/tarkov';
const logger = createLogger('TarkovJson');
const TARKOV_JSON_BASE_URL = 'https://json.tarkov.dev';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 3;
const ENGLISH_LANGUAGE = 'en';
const PRESTIGE_SOURCE_GAME_MODE = 'regular';
const MAX_DETAILED_OBJECTIVE_ITEMS = 24;
const HIDEOUT_SKILL_REQUIREMENT_SKILLS: Record<string, { id: string; name: string }> = {
  '5d388e97081959000a123acf-2-3': { id: 'Endurance', name: 'Endurance' },
  '5d473c1e081959000e530190-3-5': { id: 'Strength', name: 'Strength' },
  '5d484fb3654e7600681d9314-2-1': { id: 'Endurance', name: 'Endurance' },
  '5d484fc8654e760065037abf-2-3': { id: 'Attention', name: 'Attention' },
  '5d484fcd654e7668ec2ec322-2-2': { id: 'Health', name: 'Health' },
  '5d484fcd654e7668ec2ec322-3-8': { id: 'Vitality', name: 'Vitality' },
  '5d484fd1654e76006732bf2e-3-4': { id: 'Metabolism', name: 'Metabolism' },
  '5d484fdf654e7600691aadf8-2-7': { id: 'Attention', name: 'Attention' },
  '5d494a0e5b56502f18c98a02-1-2': {
    id: 'HideoutManagement',
    name: 'Hideout Management',
  },
};
type JsonRecord = Record<string, unknown>;
type TarkovJsonEndpoint = 'hideout' | 'items' | 'maps' | 'tasks' | 'traders';
type TarkovJsonEnvelope<T = unknown> = {
  data: T;
  translations?: string[];
};
type TarkovJsonRequest = {
  headers: {
    Accept: string;
  };
  timeout: number;
  retry: number;
};
type TarkovJsonFetcherRequest = <T = unknown>(
  url: string,
  request: TarkovJsonRequest
) => Promise<T>;
type TarkovJsonDependencies = {
  fetcher?: TarkovJsonFetcherRequest;
  logger?: Pick<typeof logger, 'error' | 'warn'>;
  sleep?: (ms: number) => Promise<void>;
};
type TarkovJsonOptions = {
  gameMode?: ValidGameMode;
  lang?: string;
  baseUrl?: string;
  maxRetries?: number;
  timeoutMs?: number;
  deps?: TarkovJsonDependencies;
};
type TarkovJsonPrestigeOptions = Omit<TarkovJsonOptions, 'gameMode'>;
type JsonPathResult = {
  parent?: unknown;
  parentProperty?: string | number;
  value?: unknown;
};
type TranslationLookupResult = {
  source: 'fallback' | 'primary';
  value: string;
};
type JsonItemsPayload = {
  items?: unknown;
  itemCategories?: unknown;
  playerLevels?: unknown;
  skills?: unknown;
};
type JsonTasksPayload = {
  questItems?: unknown;
  tasks?: unknown;
  prestige?: unknown;
};
type JsonMapsPayload = {
  maps?: unknown;
};
type AdapterContext = {
  itemsById?: Map<string, JsonRecord>;
  itemCategoriesById?: Map<string, JsonRecord>;
  questItemsById?: Map<string, JsonRecord>;
  tasksById?: Map<string, JsonRecord>;
  mapsById?: Map<string, JsonRecord>;
  tradersById?: Map<string, JsonRecord>;
  hideoutById?: Map<string, JsonRecord>;
};
const isRecord = (value: unknown): value is JsonRecord => {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
};
const toRecordArray = (value: unknown): JsonRecord[] => {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value)) return Object.values(value).filter(isRecord);
  return [];
};
const toLookup = (value: unknown): Map<string, JsonRecord> => {
  const entries = toRecordArray(value)
    .map((entry) => [typeof entry.id === 'string' ? entry.id : null, entry] as const)
    .filter((entry): entry is readonly [string, JsonRecord] => Boolean(entry[0]));
  return new Map(entries);
};
const compactObject = <T extends JsonRecord>(value: T): T => {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
};
const stringId = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (isRecord(value) && typeof value.id === 'string') return value.id;
  return undefined;
};
const readRecordRef = (value: unknown, ...lookups: Array<Map<string, JsonRecord> | undefined>) => {
  if (isRecord(value)) return value;
  if (typeof value === 'string') {
    for (const lookup of lookups) {
      const record = lookup?.get(value);
      if (record) return record;
    }
    return { id: value };
  }
  return undefined;
};
const buildPath = (endpoint: TarkovJsonEndpoint, options: TarkovJsonOptions, lang?: string) => {
  const gameMode = options.gameMode ?? 'regular';
  return `${gameMode}/${endpoint}${lang ? `_${lang}` : ''}`;
};
function validateEnvelope<T>(payload: unknown, path: string): TarkovJsonEnvelope<T> {
  if (!isRecord(payload) || !Object.prototype.hasOwnProperty.call(payload, 'data')) {
    throw new Error(`Invalid json.tarkov.dev response for ${path}: missing data`);
  }
  if (payload.data === null || payload.data === undefined) {
    throw new Error(`Invalid json.tarkov.dev response for ${path}: missing data`);
  }
  const translations = payload.translations;
  if (translations !== undefined && !Array.isArray(translations)) {
    throw new Error(`Invalid json.tarkov.dev response for ${path}: translations is not an array`);
  }
  return payload as TarkovJsonEnvelope<T>;
}
function normalizeBaseUrl(value: string | undefined): string {
  const baseUrl = value?.trim().replace(/\/+$/, '');
  return baseUrl || TARKOV_JSON_BASE_URL;
}
function getRuntimeBaseUrl(): string | undefined {
  try {
    const runtimeConfig = useRuntimeConfig();
    return typeof runtimeConfig.tarkovJsonBaseUrl === 'string'
      ? runtimeConfig.tarkovJsonBaseUrl
      : undefined;
  } catch {
    return undefined;
  }
}
function resolveBaseUrl(options: TarkovJsonOptions): string {
  return normalizeBaseUrl(options.baseUrl || getRuntimeBaseUrl());
}
async function fetchEnvelope<T>(
  path: string,
  options: TarkovJsonOptions
): Promise<TarkovJsonEnvelope<T>> {
  const fetcher = options.deps?.fetcher ?? ($fetch as TarkovJsonFetcherRequest);
  const fetcherLogger = options.deps?.logger ?? logger;
  const sleep =
    options.deps?.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }));
  const maxRetries = Number.isFinite(options.maxRetries)
    ? Math.max(1, Math.floor(options.maxRetries ?? DEFAULT_MAX_RETRIES))
    : DEFAULT_MAX_RETRIES;
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1000, Math.floor(options.timeoutMs ?? DEFAULT_TIMEOUT_MS))
    : DEFAULT_TIMEOUT_MS;
  const url = `${resolveBaseUrl(options)}/${path}`;
  const cacheKey = `${url}|${timeoutMs}|${maxRetries}`;
  const existing = inFlightEnvelopeFetches.get(cacheKey);
  if (existing) {
    return validateEnvelope<T>(await existing, path);
  }
  const fetchPromise = fetchEnvelopePayload(url, path, {
    fetcher,
    fetcherLogger,
    maxRetries,
    sleep,
    timeoutMs,
  });
  inFlightEnvelopeFetches.set(cacheKey, fetchPromise);
  try {
    return validateEnvelope<T>(await fetchPromise, path);
  } finally {
    if (inFlightEnvelopeFetches.get(cacheKey) === fetchPromise) {
      inFlightEnvelopeFetches.delete(cacheKey);
    }
  }
}
const inFlightEnvelopeFetches = new Map<string, Promise<unknown>>();
async function fetchEnvelopePayload(
  url: string,
  path: string,
  options: {
    fetcher: TarkovJsonFetcherRequest;
    fetcherLogger: Pick<typeof logger, 'error' | 'warn'>;
    maxRetries: number;
    sleep: (ms: number) => Promise<void>;
    timeoutMs: number;
  }
): Promise<unknown> {
  const { fetcher, fetcherLogger, maxRetries, sleep, timeoutMs } = options;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetcher<unknown>(url, {
        headers: { Accept: 'application/json' },
        timeout: timeoutMs,
        retry: 0,
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isLastAttempt = attempt === maxRetries;
      if (isLastAttempt) {
        fetcherLogger.error(`[TarkovJson] All ${maxRetries} attempts failed`, {
          error: lastError,
          path,
        });
      } else {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        fetcherLogger.warn(
          `[TarkovJson] Attempt ${attempt}/${maxRetries} failed, retrying in ${delayMs}ms`,
          { error: lastError, path }
        );
        await sleep(delayMs);
      }
      continue;
    }
  }
  throw lastError || new Error(`Failed to fetch ${path}`);
}
const UNSAFE_TRANSLATION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function readTranslation(
  translations: JsonRecord | undefined,
  fallbackTranslations: JsonRecord | undefined,
  translationKey: string
): TranslationLookupResult | undefined {
  if (UNSAFE_TRANSLATION_KEYS.has(translationKey)) return undefined;
  if (translations && Object.prototype.hasOwnProperty.call(translations, translationKey)) {
    const value = translations[translationKey];
    return typeof value === 'string' ? { source: 'primary', value } : undefined;
  }
  if (
    fallbackTranslations &&
    fallbackTranslations !== translations &&
    Object.prototype.hasOwnProperty.call(fallbackTranslations, translationKey)
  ) {
    const value = fallbackTranslations[translationKey];
    return typeof value === 'string' ? { source: 'fallback', value } : undefined;
  }
  return undefined;
}
function parseJsonPath(path: string): string[] | null {
  if (!path.startsWith('$.')) return null;
  const parts = path.slice(2).split('.');
  const segments: string[] = [];
  for (const part of parts) {
    if (!part) return null;
    if (part === '*') {
      segments.push('*');
    } else if (part.endsWith('[*]')) {
      const key = part.slice(0, -3);
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) return null;
      segments.push(part);
    } else {
      if (!/^[a-zA-Z0-9_-]+$/.test(part)) return null;
      segments.push(part);
    }
  }
  return segments;
}
function immutableUpdate(
  obj: unknown,
  segments: string[],
  index: number,
  translateFn: (val: string) => string | undefined
): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (index >= segments.length) {
    return obj;
  }
  const segment = segments[index];
  if (segment === undefined) {
    return obj;
  }
  const isLast = index === segments.length - 1;
  if (segment === '*') {
    if (Array.isArray(obj)) {
      let copied = false;
      let newArr = obj as unknown[];
      for (let i = 0; i < obj.length; i++) {
        if (isLast) {
          const val = obj[i];
          if (typeof val === 'string') {
            const trans = translateFn(val);
            if (trans !== undefined) {
              if (!copied) {
                newArr = [...obj];
                copied = true;
              }
              newArr[i] = trans;
            }
          }
        } else {
          const updated = immutableUpdate(obj[i], segments, index + 1, translateFn);
          if (updated !== obj[i]) {
            if (!copied) {
              newArr = [...obj];
              copied = true;
            }
            newArr[i] = updated;
          }
        }
      }
      return newArr;
    } else {
      let copied = false;
      const record = obj as Record<string, unknown>;
      let newObj = record;
      for (const key of Object.keys(record)) {
        if (isLast) {
          const val = record[key];
          if (typeof val === 'string') {
            const trans = translateFn(val);
            if (trans !== undefined) {
              if (!copied) {
                newObj = { ...record };
                copied = true;
              }
              newObj[key] = trans;
            }
          }
        } else {
          const updated = immutableUpdate(record[key], segments, index + 1, translateFn);
          if (updated !== record[key]) {
            if (!copied) {
              newObj = { ...record };
              copied = true;
            }
            newObj[key] = updated;
          }
        }
      }
      return newObj;
    }
  } else if (segment.endsWith('[*]')) {
    const prop = segment.slice(0, -3);
    const record = obj as Record<string, unknown>;
    const arr = record[prop];
    if (Array.isArray(arr)) {
      let copied = false;
      let newArr = arr as unknown[];
      for (let i = 0; i < arr.length; i++) {
        if (isLast) {
          const val = arr[i];
          if (typeof val === 'string') {
            const trans = translateFn(val);
            if (trans !== undefined) {
              if (!copied) {
                newArr = [...arr];
                copied = true;
              }
              newArr[i] = trans;
            }
          }
        } else {
          const updated = immutableUpdate(arr[i], segments, index + 1, translateFn);
          if (updated !== arr[i]) {
            if (!copied) {
              newArr = [...arr];
              copied = true;
            }
            newArr[i] = updated;
          }
        }
      }
      if (newArr !== arr) {
        return {
          ...record,
          [prop]: newArr,
        };
      }
    }
    return obj;
  } else {
    const record = obj as Record<string, unknown>;
    const val = record[segment];
    if (isLast) {
      if (typeof val === 'string') {
        const trans = translateFn(val);
        if (trans !== undefined) {
          return {
            ...record,
            [segment]: trans,
          };
        }
      }
    } else {
      const updated = immutableUpdate(val, segments, index + 1, translateFn);
      if (updated !== val) {
        return {
          ...record,
          [segment]: updated,
        };
      }
    }
    return obj;
  }
}
function applyTranslations<T>(
  response: TarkovJsonEnvelope<T>,
  primaryTranslations?: JsonRecord,
  fallbackTranslations?: JsonRecord
): T {
  const translations = primaryTranslations ?? fallbackTranslations;
  if (!translations || !response.translations?.length) return response.data;
  const translateFn = (key: string) => {
    const translated = readTranslation(translations, fallbackTranslations, key);
    return translated?.value;
  };
  let updatedResponse = response as TarkovJsonEnvelope<T>;
  let useFallback = false;
  for (const path of response.translations ?? []) {
    const segments = parseJsonPath(path);
    if (segments) {
      try {
        updatedResponse = immutableUpdate(
          updatedResponse,
          segments,
          0,
          translateFn
        ) as TarkovJsonEnvelope<T>;
      } catch (error) {
        logger.warn('[TarkovJson] Failed to apply fast translation path', {
          error: error instanceof Error ? error.message : String(error),
          path,
        });
        useFallback = true;
        break;
      }
    } else {
      useFallback = true;
      break;
    }
  }
  if (useFallback) {
    const translatedResponse = structuredClone(response) as TarkovJsonEnvelope<T>;
    for (const path of response.translations ?? []) {
      try {
        JSONPath({
          path,
          json: translatedResponse,
          resultType: 'all',
          callback: (result: JsonPathResult) => {
            const parent = result.parent;
            if (!isRecord(parent) && !Array.isArray(parent)) return;
            const parentProperty = result.parentProperty;
            if (parentProperty === undefined) return;
            const translationKey = result.value;
            if (typeof translationKey !== 'string') return;
            const translated = readTranslation(translations, fallbackTranslations, translationKey);
            if (!translated) return;
            if (translated.source === 'fallback') {
              logger.debug('[TarkovJson] Applied fallback translation', { path, translationKey });
            }
            (parent as Record<string | number, unknown>)[parentProperty] = translated.value;
          },
        });
      } catch (error) {
        logger.warn('[TarkovJson] Failed to apply translation path', {
          error: error instanceof Error ? error.message : String(error),
          path,
        });
      }
    }
    return translatedResponse.data;
  }
  return updatedResponse.data;
}
export async function fetchTarkovJsonEndpoint<T>(
  endpoint: TarkovJsonEndpoint,
  options: TarkovJsonOptions = {}
): Promise<T> {
  const lang = options.lang?.trim() || ENGLISH_LANGUAGE;
  const baseResponse = await fetchEnvelope<T>(buildPath(endpoint, options), options);
  if (!baseResponse.translations?.length) {
    return baseResponse.data;
  }
  const [primaryResponse, fallbackResponse] = await Promise.allSettled([
    fetchEnvelope<JsonRecord>(buildPath(endpoint, options, lang), options),
    lang === ENGLISH_LANGUAGE
      ? Promise.resolve(undefined)
      : fetchEnvelope<JsonRecord>(buildPath(endpoint, options, ENGLISH_LANGUAGE), options),
  ]);
  return applyTranslations(
    baseResponse,
    primaryResponse.status === 'fulfilled' ? primaryResponse.value.data : undefined,
    fallbackResponse.status === 'fulfilled' ? fallbackResponse.value?.data : undefined
  );
}
function adaptCategoryRef(value: unknown, context: AdapterContext) {
  const raw = readRecordRef(value, context.itemCategoriesById);
  if (!raw) return undefined;
  return compactObject({
    id: stringId(raw),
    name: typeof raw.name === 'string' ? raw.name : undefined,
    normalizedName: typeof raw.normalizedName === 'string' ? raw.normalizedName : undefined,
  });
}
function adaptItemRef(value: unknown, context: AdapterContext): TarkovItem {
  const id = stringId(value) ?? '';
  const raw = readRecordRef(value, context.itemsById, context.questItemsById);
  if (!raw) return { id };
  const rawProperties = isRecord(raw.properties) ? { ...raw.properties } : undefined;
  if (rawProperties && typeof rawProperties.defaultPreset === 'string') {
    rawProperties.defaultPreset = adaptItemRef(rawProperties.defaultPreset, context);
  }
  return compactObject({
    id: typeof raw.id === 'string' ? raw.id : id,
    shortName: typeof raw.shortName === 'string' ? raw.shortName : undefined,
    name: typeof raw.name === 'string' ? raw.name : undefined,
    normalizedName: typeof raw.normalizedName === 'string' ? raw.normalizedName : undefined,
    link: typeof raw.link === 'string' ? raw.link : undefined,
    wikiLink: typeof raw.wikiLink === 'string' ? raw.wikiLink : undefined,
    image512pxLink: typeof raw.image512pxLink === 'string' ? raw.image512pxLink : undefined,
    image8xLink: typeof raw.image8xLink === 'string' ? raw.image8xLink : undefined,
    gridImageLink: typeof raw.gridImageLink === 'string' ? raw.gridImageLink : undefined,
    baseImageLink: typeof raw.baseImageLink === 'string' ? raw.baseImageLink : undefined,
    iconLink: typeof raw.iconLink === 'string' ? raw.iconLink : undefined,
    backgroundColor: typeof raw.backgroundColor === 'string' ? raw.backgroundColor : undefined,
    properties: rawProperties,
  }) as TarkovItem;
}
function adaptObjectiveItemRef(value: unknown, context: AdapterContext): TarkovItem {
  const id = stringId(value) ?? '';
  const raw = readRecordRef(value, context.itemsById, context.questItemsById);
  if (!raw) return { id };
  const rawProperties = isRecord(raw.properties) ? raw.properties : undefined;
  const rawDefaultPreset = isRecord(rawProperties?.defaultPreset)
    ? rawProperties.defaultPreset
    : readRecordRef(rawProperties?.defaultPreset, context.itemsById);
  const defaultPreset = rawDefaultPreset
    ? compactObject({
        id: stringId(rawDefaultPreset),
        iconLink:
          typeof rawDefaultPreset.iconLink === 'string' ? rawDefaultPreset.iconLink : undefined,
        image512pxLink:
          typeof rawDefaultPreset.image512pxLink === 'string'
            ? rawDefaultPreset.image512pxLink
            : undefined,
        backgroundColor:
          typeof rawDefaultPreset.backgroundColor === 'string'
            ? rawDefaultPreset.backgroundColor
            : undefined,
      })
    : undefined;
  return compactObject({
    id: typeof raw.id === 'string' ? raw.id : id,
    shortName: typeof raw.shortName === 'string' ? raw.shortName : undefined,
    name: typeof raw.name === 'string' ? raw.name : undefined,
    normalizedName: typeof raw.normalizedName === 'string' ? raw.normalizedName : undefined,
    link: typeof raw.link === 'string' ? raw.link : undefined,
    wikiLink: typeof raw.wikiLink === 'string' ? raw.wikiLink : undefined,
    image512pxLink: typeof raw.image512pxLink === 'string' ? raw.image512pxLink : undefined,
    image8xLink: typeof raw.image8xLink === 'string' ? raw.image8xLink : undefined,
    gridImageLink: typeof raw.gridImageLink === 'string' ? raw.gridImageLink : undefined,
    baseImageLink: typeof raw.baseImageLink === 'string' ? raw.baseImageLink : undefined,
    iconLink: typeof raw.iconLink === 'string' ? raw.iconLink : undefined,
    backgroundColor: typeof raw.backgroundColor === 'string' ? raw.backgroundColor : undefined,
    properties: defaultPreset ? { defaultPreset } : undefined,
  }) as TarkovItem;
}
function adaptObjectiveItemRefs(
  values: unknown,
  context: AdapterContext
): TarkovItem[] | undefined {
  if (!Array.isArray(values)) return undefined;
  return values
    .map((item, index) => {
      if (index < MAX_DETAILED_OBJECTIVE_ITEMS) return adaptObjectiveItemRef(item, context);
      const id = stringId(item);
      return id ? ({ id } as TarkovItem) : undefined;
    })
    .filter((item): item is TarkovItem => Boolean(item?.id));
}
function adaptItem(raw: JsonRecord, context: AdapterContext, lite = false): TarkovItem {
  const categories = Array.isArray(raw.categories)
    ? raw.categories.map((category) => adaptCategoryRef(category, context)).filter(Boolean)
    : undefined;
  const containsItems = Array.isArray(raw.containsItems)
    ? raw.containsItems.filter(isRecord).map((entry) => ({
        item: adaptItemRef(entry.item, context),
        count: typeof entry.count === 'number' ? entry.count : 1,
      }))
    : undefined;
  const base = adaptItemRef(raw, context);
  if (lite) return base;
  return compactObject({
    ...raw,
    ...base,
    categories,
    category: categories?.[0],
    containsItems,
  }) as TarkovItem;
}
function adaptMapRef(value: unknown, context: AdapterContext) {
  const raw = readRecordRef(value, context.mapsById);
  if (!raw) return undefined;
  return compactObject({
    id: stringId(raw),
    name: typeof raw.name === 'string' ? raw.name : undefined,
  });
}
function adaptTraderRef(value: unknown, context: AdapterContext) {
  const raw = readRecordRef(value, context.tradersById);
  if (!raw) return undefined;
  return compactObject({
    id: stringId(raw),
    name: typeof raw.name === 'string' ? raw.name : undefined,
    normalizedName: typeof raw.normalizedName === 'string' ? raw.normalizedName : undefined,
    imageLink: typeof raw.imageLink === 'string' ? raw.imageLink : undefined,
  });
}
function adaptHideoutRef(value: unknown, context: AdapterContext) {
  const raw = readRecordRef(value, context.hideoutById);
  if (!raw) return undefined;
  return compactObject({
    id: stringId(raw),
    name: typeof raw.name === 'string' ? raw.name : undefined,
  });
}
function inferObjectiveTypename(type: unknown): string | undefined {
  if (typeof type !== 'string') return undefined;
  const typenameByType: Record<string, string> = {
    buildItem: 'TaskObjectiveBuildItem',
    buildWeapon: 'TaskObjectiveBuildItem',
    experience: 'TaskObjectiveExperience',
    extract: 'TaskObjectiveExtract',
    findItem: 'TaskObjectiveItem',
    findQuestItem: 'TaskObjectiveQuestItem',
    giveItem: 'TaskObjectiveItem',
    giveQuestItem: 'TaskObjectiveQuestItem',
    haveItem: 'TaskObjectiveItem',
    hideoutStation: 'TaskObjectiveHideoutStation',
    mark: 'TaskObjectiveMark',
    playerLevel: 'TaskObjectivePlayerLevel',
    plantItem: 'TaskObjectiveItem',
    plantQuestItem: 'TaskObjectiveQuestItem',
    questItem: 'TaskObjectiveQuestItem',
    sellItem: 'TaskObjectiveItem',
    shoot: 'TaskObjectiveShoot',
    skill: 'TaskObjectiveSkill',
    taskStatus: 'TaskObjectiveTaskStatus',
    traderLevel: 'TaskObjectiveTraderLevel',
    traderStanding: 'TaskObjectiveTraderStanding',
    useItem: 'TaskObjectiveUseItem',
    visit: 'TaskObjectiveBasic',
  };
  return typenameByType[type];
}
function adaptRequiredKeys(value: unknown, context: AdapterContext): TarkovItem[][] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((group) => {
      const rawGroup = Array.isArray(group) ? group : [group];
      return rawGroup.map((item) => adaptObjectiveItemRef(item, context)).filter((item) => item.id);
    })
    .filter((group) => group.length > 0);
}
function adaptZone(raw: unknown, context: AdapterContext) {
  if (!isRecord(raw)) return raw;
  return compactObject({
    ...raw,
    map: adaptMapRef(raw.map, context),
  });
}
function adaptMapWithPositions(raw: unknown, context: AdapterContext) {
  if (!isRecord(raw)) return raw;
  return compactObject({
    ...raw,
    map: adaptMapRef(raw.map, context),
  });
}
function adaptObjective(raw: JsonRecord, context: AdapterContext): TaskObjective {
  const skillName = typeof raw.skill === 'string' ? raw.skill : undefined;
  const skillLevelValue = typeof raw.level === 'number' ? raw.level : raw.skillLevel;
  const stationValue = raw.hideoutStation ?? raw.station;
  return compactObject({
    ...raw,
    id: stringId(raw) ?? '',
    __typename:
      typeof raw.__typename === 'string' ? raw.__typename : inferObjectiveTypename(raw.type),
    maps: Array.isArray(raw.maps)
      ? raw.maps.map((map) => adaptMapRef(map, context)).filter(Boolean)
      : undefined,
    zones: Array.isArray(raw.zones) ? raw.zones.map((zone) => adaptZone(zone, context)) : undefined,
    possibleLocations: Array.isArray(raw.possibleLocations)
      ? raw.possibleLocations.map((location) => adaptMapWithPositions(location, context))
      : undefined,
    requiredKeys: adaptRequiredKeys(raw.requiredKeys, context),
    item: raw.item ? adaptObjectiveItemRef(raw.item, context) : undefined,
    items: adaptObjectiveItemRefs(raw.items, context),
    markerItem: raw.markerItem ? adaptObjectiveItemRef(raw.markerItem, context) : undefined,
    questItem: raw.questItem ? adaptItemRef(raw.questItem, context) : undefined,
    containsAll: Array.isArray(raw.containsAll)
      ? raw.containsAll.map((item) => adaptObjectiveItemRef(item, context))
      : undefined,
    useAny: Array.isArray(raw.useAny)
      ? raw.useAny.map((item) => adaptObjectiveItemRef(item, context))
      : undefined,
    usingWeapon: raw.usingWeapon ? adaptObjectiveItemRef(raw.usingWeapon, context) : undefined,
    usingWeaponMods: Array.isArray(raw.usingWeaponMods)
      ? raw.usingWeaponMods.map((item) => adaptObjectiveItemRef(item, context))
      : undefined,
    wearing: Array.isArray(raw.wearing)
      ? raw.wearing.map((item) => adaptObjectiveItemRef(item, context))
      : undefined,
    notWearing: Array.isArray(raw.notWearing)
      ? raw.notWearing.map((item) => adaptObjectiveItemRef(item, context))
      : undefined,
    hideoutStation: stationValue ? adaptHideoutRef(stationValue, context) : undefined,
    skillLevel:
      skillName && typeof skillLevelValue === 'number'
        ? {
            name: skillName,
            level: skillLevelValue,
            skill: { id: skillName, name: skillName },
          }
        : raw.skillLevel,
    task: raw.task ? adaptTaskRef(raw.task, context) : undefined,
    trader: raw.trader ? adaptTraderRef(raw.trader, context) : undefined,
  }) as TaskObjective;
}
function adaptTaskRef(value: unknown, context: AdapterContext) {
  const id = stringId(value);
  if (!id) return undefined;
  const raw = context.tasksById?.get(id);
  return compactObject({
    id,
    name: typeof raw?.name === 'string' ? raw.name : undefined,
    wikiLink: typeof raw?.wikiLink === 'string' ? raw.wikiLink : undefined,
  });
}
function adaptTaskRequirement(raw: unknown, context: AdapterContext) {
  if (!isRecord(raw)) return raw;
  return compactObject({
    ...raw,
    task: adaptTaskRef(raw.task, context),
  });
}
function adaptTraderRequirement(raw: unknown, context: AdapterContext) {
  if (!isRecord(raw)) return raw;
  return compactObject({
    ...raw,
    trader: adaptTraderRef(raw.trader, context),
  });
}
function adaptTaskCore(raw: JsonRecord, context: AdapterContext): Task {
  return compactObject({
    id: stringId(raw) ?? '',
    name: typeof raw.name === 'string' ? raw.name : undefined,
    trader: adaptTraderRef(raw.trader, context),
    map: adaptMapRef(raw.map, context),
    kappaRequired: typeof raw.kappaRequired === 'boolean' ? raw.kappaRequired : undefined,
    lightkeeperRequired:
      typeof raw.lightkeeperRequired === 'boolean' ? raw.lightkeeperRequired : undefined,
    experience: typeof raw.experience === 'number' ? raw.experience : undefined,
    wikiLink: typeof raw.wikiLink === 'string' ? raw.wikiLink : undefined,
    minPlayerLevel: typeof raw.minPlayerLevel === 'number' ? raw.minPlayerLevel : undefined,
    taskRequirements: Array.isArray(raw.taskRequirements)
      ? raw.taskRequirements.map((requirement) => adaptTaskRequirement(requirement, context))
      : undefined,
    traderRequirements: Array.isArray(raw.traderRequirements)
      ? raw.traderRequirements.map((requirement) => adaptTraderRequirement(requirement, context))
      : undefined,
    factionName: typeof raw.factionName === 'string' ? raw.factionName : undefined,
  }) as Task;
}
function adaptMap(raw: JsonRecord): TarkovMap {
  return compactObject({
    ...raw,
    id: stringId(raw) ?? '',
    name: typeof raw.name === 'string' ? raw.name : '',
  }) as TarkovMap;
}
function adaptTrader(raw: JsonRecord): Trader {
  return compactObject({
    ...raw,
    id: stringId(raw) ?? '',
  }) as Trader;
}
function adaptReward(raw: unknown, context: AdapterContext): FinishRewards | undefined {
  if (!isRecord(raw)) return undefined;
  return compactObject({
    ...raw,
    traderStanding: Array.isArray(raw.traderStanding)
      ? raw.traderStanding.filter(isRecord).map((entry) => ({
          ...entry,
          trader: adaptTraderRef(entry.trader, context),
        }))
      : undefined,
    items: Array.isArray(raw.items)
      ? raw.items.filter(isRecord).map((entry) => ({
          ...entry,
          item: adaptItemRef(entry.item, context),
        }))
      : undefined,
    offerUnlock: Array.isArray(raw.offerUnlock)
      ? raw.offerUnlock.filter(isRecord).map((entry) => ({
          ...entry,
          trader: adaptTraderRef(entry.trader, context),
          item: adaptItemRef(entry.item, context),
        }))
      : undefined,
    skillLevelReward: Array.isArray(raw.skillLevelReward)
      ? raw.skillLevelReward.filter(isRecord).map((entry) => {
          const skillName = typeof entry.skill === 'string' ? entry.skill : entry.name;
          return compactObject({
            ...entry,
            name: typeof entry.name === 'string' ? entry.name : skillName,
            skill:
              typeof skillName === 'string'
                ? {
                    id: skillName,
                    name: skillName,
                  }
                : undefined,
          });
        })
      : undefined,
  }) as FinishRewards;
}
function adaptTaskObjectives(
  raw: JsonRecord,
  context: AdapterContext
): Pick<Task, 'failConditions' | 'id' | 'objectives'> {
  return {
    id: stringId(raw) ?? '',
    objectives: Array.isArray(raw.objectives)
      ? raw.objectives.filter(isRecord).map((objective) => adaptObjective(objective, context))
      : [],
    failConditions: Array.isArray(raw.failConditions)
      ? raw.failConditions.filter(isRecord).map((objective) => adaptObjective(objective, context))
      : [],
  };
}
function adaptTaskRewards(
  raw: JsonRecord,
  context: AdapterContext
): Pick<Task, 'failureOutcome' | 'finishRewards' | 'id' | 'startRewards'> {
  return compactObject({
    id: stringId(raw) ?? '',
    startRewards: adaptReward(raw.startRewards, context),
    finishRewards: adaptReward(raw.finishRewards, context),
    failureOutcome: adaptReward(raw.failureOutcome, context),
  }) as Pick<Task, 'failureOutcome' | 'finishRewards' | 'id' | 'startRewards'>;
}
function adaptHideoutRequirement(raw: unknown, context: AdapterContext) {
  if (!isRecord(raw)) return raw;
  const attributes = isRecord(raw.attributes)
    ? Object.entries(raw.attributes).map(([name, value]) => ({
        type: name,
        name,
        value: String(value),
      }))
    : raw.attributes;
  const skillValue = raw.skill;
  const skillFallback =
    typeof raw.id === 'string' ? HIDEOUT_SKILL_REQUIREMENT_SKILLS[raw.id] : undefined;
  const skillName =
    isRecord(skillValue) && typeof skillValue.name === 'string'
      ? skillValue.name
      : typeof skillValue === 'string'
        ? skillValue
        : typeof raw.name === 'string'
          ? raw.name
          : skillFallback?.name;
  const skillId =
    isRecord(skillValue) && typeof skillValue.id === 'string'
      ? skillValue.id
      : skillFallback?.id || skillName;
  return compactObject({
    ...raw,
    attributes,
    item: raw.item ? adaptItemRef(raw.item, context) : undefined,
    name: skillName,
    quantity: typeof raw.quantity === 'number' ? raw.quantity : raw.count,
    skill:
      skillName && skillId
        ? {
            id: skillId,
            name: skillName,
          }
        : undefined,
    station: raw.station ? adaptHideoutRef(raw.station, context) : undefined,
    trader: raw.trader ? adaptTraderRef(raw.trader, context) : undefined,
  });
}
function adaptHideoutStation(raw: JsonRecord, context: AdapterContext): HideoutStation {
  return compactObject({
    ...raw,
    id: stringId(raw) ?? '',
    levels: Array.isArray(raw.levels)
      ? raw.levels.filter(isRecord).map((level) =>
          compactObject({
            ...level,
            itemRequirements: Array.isArray(level.itemRequirements)
              ? level.itemRequirements.map((requirement) =>
                  adaptHideoutRequirement(requirement, context)
                )
              : [],
            stationLevelRequirements: Array.isArray(level.stationLevelRequirements)
              ? level.stationLevelRequirements.map((requirement) =>
                  adaptHideoutRequirement(requirement, context)
                )
              : [],
            skillRequirements: Array.isArray(level.skillRequirements)
              ? level.skillRequirements.map((requirement) =>
                  adaptHideoutRequirement(requirement, context)
                )
              : [],
            traderRequirements: Array.isArray(level.traderRequirements)
              ? level.traderRequirements.map((requirement) =>
                  adaptHideoutRequirement(requirement, context)
                )
              : [],
            crafts: Array.isArray(level.crafts)
              ? level.crafts.filter(isRecord).map((craft) =>
                  compactObject({
                    ...craft,
                    requiredItems: Array.isArray(craft.requiredItems)
                      ? craft.requiredItems.map((item) => adaptHideoutRequirement(item, context))
                      : [],
                    rewardItems: Array.isArray(craft.rewardItems)
                      ? craft.rewardItems.map((item) => adaptHideoutRequirement(item, context))
                      : [],
                  })
                )
              : [],
          })
        )
      : [],
  }) as HideoutStation;
}
function adaptPrestigeLevel(raw: JsonRecord, context: AdapterContext): PrestigeLevel {
  return compactObject({
    ...raw,
    id: stringId(raw) ?? '',
    level: typeof raw.level === 'number' ? raw.level : raw.prestigeLevel,
    prestigeLevel: typeof raw.prestigeLevel === 'number' ? raw.prestigeLevel : raw.level,
    conditions: Array.isArray(raw.conditions)
      ? raw.conditions.filter(isRecord).map((condition) => adaptObjective(condition, context))
      : [],
    rewards: adaptReward(raw.rewards, context) ?? raw.rewards,
  }) as PrestigeLevel;
}
function buildItemsContext(itemsPayload: JsonItemsPayload): AdapterContext {
  const itemsById = toLookup(itemsPayload.items);
  return {
    itemsById,
    itemCategoriesById: toLookup(itemsPayload.itemCategories),
  };
}
function buildContext(options: {
  hideoutPayload?: unknown;
  itemsPayload?: JsonItemsPayload;
  mapsPayload?: JsonMapsPayload;
  tasksPayload?: JsonTasksPayload;
  tradersPayload?: unknown;
}): AdapterContext {
  return {
    ...buildItemsContext(options.itemsPayload ?? {}),
    hideoutById: toLookup(options.hideoutPayload),
    mapsById: toLookup(options.mapsPayload?.maps),
    questItemsById: toLookup(options.tasksPayload?.questItems),
    tasksById: toLookup(options.tasksPayload?.tasks),
    tradersById: toLookup(options.tradersPayload),
  };
}
export function adaptItemsResponse(
  itemsPayload: JsonItemsPayload,
  options: { lite?: boolean } = {}
): { data: TarkovItemsQueryResult } {
  const context = buildItemsContext(itemsPayload);
  return {
    data: {
      items: toRecordArray(itemsPayload.items).map((item) =>
        adaptItem(item, context, options.lite)
      ),
    },
  };
}
export function adaptBootstrapResponse(itemsPayload: JsonItemsPayload): {
  data: TarkovBootstrapQueryResult;
} {
  return {
    data: {
      playerLevels: Array.isArray(itemsPayload.playerLevels)
        ? (itemsPayload.playerLevels as PlayerLevel[])
        : [],
    },
  };
}
export function adaptTasksCoreResponse(
  tasksPayload: JsonTasksPayload,
  mapsPayload: JsonMapsPayload,
  tradersPayload: unknown
): { data: TarkovTasksCoreQueryResult } {
  const context = buildContext({ mapsPayload, tasksPayload, tradersPayload });
  return {
    data: {
      tasks: toRecordArray(tasksPayload.tasks).map((task) => adaptTaskCore(task, context)),
      maps: toRecordArray(mapsPayload.maps).map(adaptMap),
      traders: toRecordArray(tradersPayload).map(adaptTrader),
    },
  };
}
export function adaptMapSpawnsResponse(mapsPayload: JsonMapsPayload): {
  data: TarkovMapSpawnsQueryResult;
} {
  return {
    data: {
      maps: toRecordArray(mapsPayload.maps).map((map) => ({
        id: stringId(map) ?? '',
        name: typeof map.name === 'string' ? map.name : '',
        spawns: Array.isArray(map.spawns) ? map.spawns : [],
      })),
    },
  };
}
export function adaptTaskObjectivesResponse(
  tasksPayload: JsonTasksPayload,
  options: {
    hideoutPayload?: unknown;
    itemsPayload?: JsonItemsPayload;
    mapsPayload?: JsonMapsPayload;
    tradersPayload?: unknown;
  } = {}
): { data: TarkovTaskObjectivesQueryResult } {
  const context = buildContext({ ...options, tasksPayload });
  context.tasksById = toLookup(tasksPayload.tasks);
  return {
    data: {
      tasks: toRecordArray(tasksPayload.tasks).map((task) => adaptTaskObjectives(task, context)),
    },
  };
}
export function adaptTaskRewardsResponse(
  tasksPayload: JsonTasksPayload,
  options: {
    itemsPayload?: JsonItemsPayload;
    tradersPayload?: unknown;
  } = {}
): { data: TarkovTaskRewardsQueryResult } {
  const context = buildContext({ ...options, tasksPayload });
  context.tasksById = toLookup(tasksPayload.tasks);
  return {
    data: {
      tasks: toRecordArray(tasksPayload.tasks).map((task) => adaptTaskRewards(task, context)),
    },
  };
}
export function adaptHideoutResponse(
  hideoutPayload: unknown,
  options: {
    itemsPayload?: JsonItemsPayload;
    tradersPayload?: unknown;
  } = {}
): { data: TarkovHideoutQueryResult } {
  const context = buildContext({ ...options, hideoutPayload });
  return {
    data: {
      hideoutStations: toRecordArray(hideoutPayload).map((station) =>
        adaptHideoutStation(station, context)
      ),
    },
  };
}
export function adaptPrestigeResponse(
  tasksPayload: JsonTasksPayload,
  options: {
    hideoutPayload?: unknown;
    itemsPayload?: JsonItemsPayload;
    tradersPayload?: unknown;
  } = {}
): { data: TarkovPrestigeQueryResult } {
  const context = buildContext({ ...options, tasksPayload });
  context.tasksById = toLookup(tasksPayload.tasks);
  return {
    data: {
      prestige: toRecordArray(tasksPayload.prestige).map((prestige) =>
        adaptPrestigeLevel(prestige, context)
      ),
    },
  };
}
export function createTarkovJsonBootstrapFetcher(options: TarkovJsonOptions) {
  return async () =>
    adaptBootstrapResponse(await fetchTarkovJsonEndpoint<JsonItemsPayload>('items', options));
}
export function createTarkovJsonItemsFetcher(
  options: TarkovJsonOptions,
  adapterOptions: { lite?: boolean } = {}
) {
  return async () =>
    adaptItemsResponse(
      await fetchTarkovJsonEndpoint<JsonItemsPayload>('items', options),
      adapterOptions
    );
}
export function createTarkovJsonTasksCoreFetcher(options: TarkovJsonOptions) {
  return async () => {
    const [tasksPayload, mapsPayload, tradersPayload] = await Promise.all([
      fetchTarkovJsonEndpoint<JsonTasksPayload>('tasks', options),
      fetchTarkovJsonEndpoint<JsonMapsPayload>('maps', options),
      fetchTarkovJsonEndpoint<unknown>('traders', options),
    ]);
    return adaptTasksCoreResponse(tasksPayload, mapsPayload, tradersPayload);
  };
}
export function createTarkovJsonMapSpawnsFetcher(options: TarkovJsonOptions) {
  return async () =>
    adaptMapSpawnsResponse(await fetchTarkovJsonEndpoint<JsonMapsPayload>('maps', options));
}
export function createTarkovJsonTaskObjectivesFetcher(options: TarkovJsonOptions) {
  return async () => {
    try {
      const [tasksPayload, hideoutPayload, tradersPayload] = await Promise.all([
        fetchTarkovJsonEndpoint<JsonTasksPayload>('tasks', options),
        fetchTarkovJsonEndpoint<unknown>('hideout', options),
        fetchTarkovJsonEndpoint<unknown>('traders', options),
      ]);
      return adaptTaskObjectivesResponse(tasksPayload, {
        hideoutPayload,
        tradersPayload,
      });
    } catch (error) {
      logger.error('Failed to build task objectives payload from tasks, hideout, and traders', {
        error,
      });
      throw error;
    }
  };
}
export function createTarkovJsonTaskRewardsFetcher(options: TarkovJsonOptions) {
  return async () => {
    try {
      const [tasksPayload, tradersPayload] = await Promise.all([
        fetchTarkovJsonEndpoint<JsonTasksPayload>('tasks', options),
        fetchTarkovJsonEndpoint<unknown>('traders', options),
      ]);
      return adaptTaskRewardsResponse(tasksPayload, { tradersPayload });
    } catch (error) {
      logger.error('Failed to build task rewards payload from tasks and traders', { error });
      throw error;
    }
  };
}
export function createTarkovJsonHideoutFetcher(options: TarkovJsonOptions) {
  return async () => {
    try {
      const [hideoutPayload, tradersPayload] = await Promise.all([
        fetchTarkovJsonEndpoint<unknown>('hideout', options),
        fetchTarkovJsonEndpoint<unknown>('traders', options),
      ]);
      return adaptHideoutResponse(hideoutPayload, { tradersPayload });
    } catch (error) {
      logger.error('Failed to build hideout payload from hideout and traders', { error });
      throw error;
    }
  };
}
export function createTarkovJsonPrestigeFetcher(options: TarkovJsonPrestigeOptions) {
  const regularOptions: TarkovJsonOptions = { ...options, gameMode: PRESTIGE_SOURCE_GAME_MODE };
  return async () => {
    try {
      const [tasksPayload, hideoutPayload, tradersPayload] = await Promise.all([
        fetchTarkovJsonEndpoint<JsonTasksPayload>('tasks', regularOptions),
        fetchTarkovJsonEndpoint<unknown>('hideout', regularOptions),
        fetchTarkovJsonEndpoint<unknown>('traders', regularOptions),
      ]);
      return adaptPrestigeResponse(tasksPayload, { hideoutPayload, tradersPayload });
    } catch (error) {
      logger.error('Failed to build prestige payload from tasks, hideout, and traders', {
        error,
      });
      throw error;
    }
  };
}
