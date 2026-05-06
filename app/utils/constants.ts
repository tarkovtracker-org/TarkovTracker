// Special hideout stations with edition-based default levels
// Uses normalizedName for language-independent, stable identification
export const SPECIAL_STATIONS = {
  STASH: 'stash',
  CULTIST_CIRCLE: 'cultist-circle',
} as const;
export const OFFLINE_ENV_FILE = '.env.example';
// PMC faction values
export const PMC_FACTIONS = ['USEC', 'BEAR'] as const;
export const DEFAULT_PMC_FACTION = 'USEC' as const;
export type PMCFaction = (typeof PMC_FACTIONS)[number]; // "USEC" | "BEAR"
// Helper to normalize and validate PMC faction input
export function normalizePMCFaction(input: string | undefined | null): PMCFaction {
  if (!input) return DEFAULT_PMC_FACTION;
  const upper = input.toUpperCase();
  return PMC_FACTIONS.includes(upper as PMCFaction) ? (upper as PMCFaction) : DEFAULT_PMC_FACTION;
}
// Default values for game setup
export const DEFAULT_GAME_EDITION = 1; // Standard Edition
// Game edition string values for legacy data validation
export const GAME_EDITION_STRING_VALUES = [
  'standard',
  'leftbehind',
  'prepareescape',
  'edgeofDarkness',
  'unheard',
] as const;
// Map internal game modes to API game modes
// Internal: "pvp" | "pve"
// API: "regular" | "pve"
export const GAME_MODES = {
  PVP: 'pvp',
  PVE: 'pve',
} as const;
export type GameMode = (typeof GAME_MODES)[keyof typeof GAME_MODES];
export const API_GAME_MODES = {
  [GAME_MODES.PVP]: 'regular',
  [GAME_MODES.PVE]: 'pve',
} as const;
export interface GameModeOption {
  label: string;
  value: GameMode;
  icon: string;
  description: string;
}
export const GAME_MODE_OPTIONS: GameModeOption[] = [
  {
    label: 'PvP',
    value: GAME_MODES.PVP,
    icon: 'mdi-sword-cross',
    description: 'Player vs Player (Standard)',
  },
  {
    label: 'PvE',
    value: GAME_MODES.PVE,
    icon: 'mdi-account-group',
    description: 'Player vs Environment (Co-op)',
  },
];
export const TASK_STATE = {
  LOCKED: 'LOCKED',
  AVAILABLE: 'AVAILABLE',
  ACTIVE: 'ACTIVE',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
} as const;
export type TaskState = (typeof TASK_STATE)[keyof typeof TASK_STATE];
// Currency item IDs to exclude from quest item tracking
// These represent in-game currencies that are always obtainable and don't need to be tracked
export const CURRENCY_ITEM_IDS = [
  '5696686a4bdc2da3298b456a', // Dollars (USD)
  '5449016a4bdc2d6f028b456f', // Roubles (RUB)
  '569668774bdc2da2298b4568', // Euros (EUR)
] as const;
// API Language Configuration
export const API_SUPPORTED_LANGUAGES = [
  'cs', // Czech
  'de', // German
  'en', // English
  'es', // Spanish
  'fr', // French
  'hu', // Hungarian
  'it', // Italian
  'ja', // Japanese
  'ko', // Korean
  'pl', // Polish
  'pt', // Portuguese
  'ro', // Romanian
  'ru', // Russian
  'sk', // Slovak
  'tr', // Turkish
  'zh', // Chinese
] as const;
// Mapping from frontend locale to API language code
// Used when the API doesn't support the specific locale
export const LOCALE_TO_API_MAPPING: Record<string, string> = {
  uk: 'en', // Ukrainian -> English (Not supported by API)
};
// Mapping from tarkov.dev map names to static data keys (fallback when normalizedName is absent)
export const MAP_NAME_MAPPING: Record<string, string> = {
  'night factory': 'factory',
  'the lab': 'lab',
  'ground zero 21+': 'groundzero',
  'ground zero tutorial': 'groundzero',
  'the labyrinth': 'labyrinth',
  terminal: 'terminal',
};
// Mapping from tarkov.dev normalizedName to static data keys (locale-independent, preferred)
export const MAP_NORMALIZED_NAME_MAPPING: Record<string, string> = {
  'night-factory': 'factory',
  'the-lab': 'lab',
  'ground-zero': 'groundzero',
  'ground-zero-21': 'groundzero',
  'ground-zero-tutorial': 'groundzero',
  'the-labyrinth': 'labyrinth',
  'streets-of-tarkov': 'streetsoftarkov',
};
// API Permissions
export const API_PERMISSIONS: Record<string, { title: string; description: string }> = {
  GP: {
    title: 'Get Progression',
    description:
      'Allows access to read your progression information, ' +
      'including your TarkovTracker display name, quest progress, hideout progress. ' +
      "Data access is restricted by the token's game mode (PvP or PvE).",
  },
  TP: {
    title: 'Get Team Progression',
    description:
      "Allows access to read a virtual copy of your team's progress, " +
      'including display names, quest, and hideout progress. ' +
      "Data access is restricted by the token's game mode (PvP or PvE).",
  },
  WP: {
    title: 'Write Progression',
    description:
      'Allows access to update your TarkovTracker progress data on your behalf. ' +
      "Updates are restricted by the token's game mode (PvP or PvE).",
  },
};
// Limits and configuration constants
export const LIMITS = {
  // Maximum characters for display name
  DISPLAY_NAME_MAX_LENGTH: 15,
  // Maximum team members (sync with Supabase edge function)
  TEAM_MAX_MEMBERS: 5,
  // Random name generation default length
  RANDOM_NAME_LENGTH: 6,
  MAX_SKILL_LEVEL: 51,
  // Maximum player level in Tarkov
  GAME_MAX_LEVEL: 79,
} as const;
export const MAX_SKILL_LEVEL = LIMITS.MAX_SKILL_LEVEL;
// Cache configuration (sync with tarkovCache.ts)
export const CACHE_CONSTANTS = {
  // Cache TTL in hours
  DEFAULT_TTL_HOURS: 12,
  MAX_TTL_HOURS: 24,
} as const;
// Traders that don't have traditional loyalty levels (LL1-4)
// Uses normalizedName for language-independent, stable identification
export const TRADERS_WITHOUT_LOYALTY_LEVELS = [
  'fence',
  'lightkeeper',
  'btr-driver',
  'mr-kerman',
  'taran',
  'voevoda',
  'radio-station',
] as const;
// Traders with non-standard or no reputation tracking (hide rep input entirely)
export const TRADERS_WITHOUT_REPUTATION = [
  'lightkeeper',
  'btr-driver',
  'mr-kerman',
  'taran',
  'voevoda',
  'radio-station',
] as const;
export const TASK_ID_REGISTRY = {
  GETTING_ACQUAINTED: '625d700cc48e6c62a440fab5',
  A_HELPING_HAND: '6752f6d83038f7df520c83e8',
  EASY_MONEY_PART_1: '66058cb22cee99303f1ba067',
  EASY_MONEY_PART_1_PVP: '66058cb22cee99303f1ba067',
  EASY_MONEY_PART_1_PVE: '6834145ebc1f443d7603c8a7',
  HOT_WHEELS: '673f4e956f1b89c7bc0f56ef',
} as const;
export type TraderUnlockTaskConfig = string | Partial<Record<GameMode, string>>;
// Traders that require a specific task to unlock
export const TRADER_UNLOCK_TASKS: Record<string, TraderUnlockTaskConfig> = {
  lightkeeper: TASK_ID_REGISTRY.GETTING_ACQUAINTED,
  'btr-driver': TASK_ID_REGISTRY.A_HELPING_HAND,
  ref: {
    [GAME_MODES.PVP]: TASK_ID_REGISTRY.EASY_MONEY_PART_1_PVP,
    [GAME_MODES.PVE]: TASK_ID_REGISTRY.EASY_MONEY_PART_1_PVE,
  },
} as const;
export function resolveTraderUnlockTaskIds(
  traderName: string | undefined,
  gameMode: GameMode
): string[] {
  if (!traderName) return [];
  const config = TRADER_UNLOCK_TASKS[traderName];
  if (!config) return [];
  if (typeof config === 'string') return [config];
  const modeSpecificId = config[gameMode];
  if (modeSpecificId) return [modeSpecificId];
  return Object.values(config).filter((value): value is string => typeof value === 'string');
}
// Trader display order (matches in-game order)
// Uses normalizedName for language-independent, stable identification
export const TRADER_ORDER = [
  'prapor',
  'therapist',
  'fence',
  'skier',
  'peacekeeper',
  'mechanic',
  'ragman',
  'jaeger',
  'lightkeeper',
  'btr-driver',
  'ref',
  'mr-kerman', // Arena trader
  'taran', // Arena trader
  'voevoda', // Arena trader
  'radio-station', // Radio operator
] as const;
export const HOT_WHEELS_TASK_ID = TASK_ID_REGISTRY.HOT_WHEELS;
export const MANUAL_FAIL_TASK_IDS: readonly string[] = [HOT_WHEELS_TASK_ID];
// Skill display order (matches in-game character screen order)
export const SKILL_ORDER_ID = [
  'Endurance',
  'Strength',
  'Vitality',
  'Health',
  'StressResistance',
  'Metabolism',
  'Immunity',
  'Perception',
  'Intellect',
  'Attention',
  'Charisma',
  'Pistol',
  'Revolver',
  'SMG',
  'Assault',
  'Shotgun',
  'Sniper',
  'LMG',
  'HMG',
  'Launcher',
  'AttachedLauncher',
  'Throwing',
  'Melee',
  'DMR',
  'AimDrills',
  'TroubleShooting',
  'Surgery',
  'CovertMovement',
  'Search',
  'MagDrills',
  'LightVests',
  'HeavyVests',
  'WeaponTreatment',
  'Crafting',
  'HideoutManagement',
] as const;
export const SKILL_SORT_MODES = ['priority', 'ingame'] as const;
export type SkillSortMode = (typeof SKILL_SORT_MODES)[number];
// Sort skills by in-game order
// Skills not in SKILL_ORDER_ID are placed at the end, sorted alphabetically
export function sortSkillsByGameOrder<T extends { name: string; id?: string; key?: string }>(
  skills: T[]
): T[] {
  return [...skills].sort((a, b) => {
    const aId = a.id ?? a.key;
    const bId = b.id ?? b.key;
    const aIndex = aId ? SKILL_ORDER_ID.indexOf(aId as (typeof SKILL_ORDER_ID)[number]) : -1;
    const bIndex = bId ? SKILL_ORDER_ID.indexOf(bId as (typeof SKILL_ORDER_ID)[number]) : -1;
    if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}
// Sort traders by in-game order using normalizedName
// Traders not in TRADER_ORDER are placed at the end, sorted alphabetically
export function sortTradersByGameOrder<T extends { name: string; normalizedName?: string }>(
  traders: T[]
): T[] {
  return [...traders].sort((a, b) => {
    const aIndex = TRADER_ORDER.indexOf(a.normalizedName as (typeof TRADER_ORDER)[number]);
    const bIndex = TRADER_ORDER.indexOf(b.normalizedName as (typeof TRADER_ORDER)[number]);
    // Traders not in the order list go to the end, sorted alphabetically
    if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}
// Map display order (matches typical task progression)
// Uses static map keys from maps.json for stable identification
export const MAP_ORDER = [
  'groundzero', // Starting map
  'customs', // Early game, lots of early quests
  'woods', // Early-mid game
  'factory', // Early tasks but optional
  'shoreline', // Mid-game health resort quests
  'interchange', // Mid-game mall quests
  'reserve', // Mid-game military base
  'lighthouse', // Mid-late game
  'streetsoftarkov', // Late game
  'lab', // End game, requires access card
  'labyrinth', // Very end game
  'terminal', // Newest/end game content
] as const;
// Sort maps by task progression order
// Maps not in MAP_ORDER are placed at the end, sorted alphabetically
export function sortMapsByGameOrder<T extends { id: string; name: string }>(
  maps: T[],
  mapKeyLookup: (map: T) => string
): T[] {
  return [...maps].sort((a, b) => {
    const aKey = mapKeyLookup(a);
    const bKey = mapKeyLookup(b);
    const aIndex = MAP_ORDER.indexOf(aKey as (typeof MAP_ORDER)[number]);
    const bIndex = MAP_ORDER.indexOf(bKey as (typeof MAP_ORDER)[number]);
    // Maps not in the order list go to the end, sorted alphabetically
    if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}
