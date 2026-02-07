import type { UserState } from '@/stores/progressState';
import type { TaskGraph } from '@/utils/graphHelpers';
import type { _GettersTree, StateTree, Store } from 'pinia';
/**
 * Type definitions for Tarkov data structures
 * This file defines the structure for:
 * - Task completion tracking
 * - Hideout module progress
 * - Game objectives and quest data
 */
// Core Tarkov Data Types
/**
 * Represents a game edition in Escape from Tarkov.
 * Each edition provides different starting bonuses and default levels.
 */
export interface GameEdition {
  /** Unique identifier for the game edition */
  id: string;
  /** Numeric value representing the edition tier (higher = better edition) */
  value: number;
  /** Display name of the edition (e.g., "Standard", "Edge of Darkness") */
  title: string;
  /** Default stash level granted by this edition */
  defaultStashLevel: number;
  /** Default Cultist Circle hideout level granted by this edition */
  defaultCultistCircleLevel: number;
  /** Bonus reputation values per trader granted by this edition */
  traderRepBonus: Record<Trader['id'], number>;
  /** Task IDs that are exclusive to this edition (only available to this edition) */
  exclusiveTaskIds?: string[];
  /** Task IDs that are excluded from this edition (not available to this edition) */
  excludedTaskIds?: string[];
}
export interface ItemCategory {
  id: string;
  name: string;
  normalizedName?: string;
}
export interface TarkovItem {
  id: string;
  shortName?: string;
  name?: string;
  normalizedName?: string;
  link?: string;
  wikiLink?: string;
  image512pxLink?: string;
  image8xLink?: string;
  gridImageLink?: string;
  baseImageLink?: string;
  iconLink?: string;
  backgroundColor?: string;
  types?: string[];
  category?: ItemCategory;
  categories?: ItemCategory[];
  containsItems?: Array<{
    item: TarkovItem;
    count: number;
  }>;
  properties?: {
    defaultPreset?: TarkovItem;
    [key: string]: unknown;
  };
}
export interface ItemRequirement {
  id: string;
  item: TarkovItem;
  count: number;
  quantity: number;
  foundInRaid?: boolean;
  attributes?: Array<{
    type: string;
    name: string;
    value: string;
  }>;
}
export interface StationLevelRequirement {
  id: string;
  station: { id: string; name: string };
  level: number;
}
export interface Skill {
  id: string;
  name: string;
  imageLink?: string;
}
export interface SkillRequirement {
  id: string;
  name: string;
  level: number;
  skill?: Skill;
}
export interface TraderRequirement {
  id: string;
  trader: { id: string; name: string };
  value: number;
}
export interface TaskTraderLevelRequirement {
  id: string;
  trader: { id: string; name: string };
  level: number;
}
export interface TraderLevelRequirementWithMet extends TaskTraderLevelRequirement {
  met: boolean;
}
export interface Craft {
  id: string;
  duration: number;
  requiredItems: ItemRequirement[];
  rewardItems: ItemRequirement[];
}
export interface HideoutLevel {
  id: string;
  level: number;
  description?: string;
  constructionTime: number;
  itemRequirements: ItemRequirement[];
  stationLevelRequirements: StationLevelRequirement[];
  skillRequirements: SkillRequirement[];
  traderRequirements: TraderRequirement[];
  crafts: Craft[];
}
export interface HideoutStation {
  id: string;
  name: string;
  normalizedName?: string;
  imageLink?: string;
  levels: HideoutLevel[];
}
export interface HideoutModule extends HideoutLevel {
  stationId: string;
  predecessors: string[];
  successors: string[];
  parents: string[];
  children: string[];
}
export interface TaskObjective {
  id: string;
  description?: string;
  location?: { id: string; name?: string };
  maps?: { id: string; name?: string }[];
  requiredKeys?: TarkovItem[][];
  zones?: Array<{
    map?: { id: string };
    outline?: Array<{ x: number; y: number; z: number }>;
    position?: { x: number; y: number; z: number };
  }>;
  possibleLocations?: Array<{
    map?: { id: string };
    positions?: Array<{ x: number; y: number; z: number }>;
  }>;
  /** The primary item this objective refers to */
  item?: TarkovItem;
  /** All accepted items for this objective (TaskObjectiveItem.items) */
  items?: TarkovItem[];
  /** Optional item used only for map/UI markers or visual overrides */
  markerItem?: TarkovItem;
  /** Item that counts for quest completion/requirements */
  questItem?: TarkovItem;
  count?: number;
  type?: string;
  foundInRaid?: boolean;
  x?: number;
  y?: number;
  optional?: boolean;
  taskId?: string;
  task?: { id: string; name?: string };
  status?: string[];
  /** All items that must be contained */
  containsAll?: TarkovItem[];
  /** Any of these items can be used */
  useAny?: TarkovItem[];
  /** Weapon that must be used */
  usingWeapon?: TarkovItem;
  /** Weapon mods that must be equipped */
  usingWeaponMods?: TarkovItem[];
  /** Items that must be worn */
  wearing?: TarkovItem[];
  /** Items that must not be worn */
  notWearing?: TarkovItem[];
}
export interface TaskRequirement {
  task: { id: string; name?: string };
  status?: string[];
}
export interface TraderStandingReward {
  trader: { id: string; name: string };
  standing: number;
}
export interface ItemReward {
  count: number;
  item: TarkovItem;
}
export interface OfferUnlockReward {
  id: string;
  trader: { id: string; name: string };
  level: number;
  item: TarkovItem;
}
export interface SkillLevelReward {
  name: string;
  level: number;
  skill?: Skill;
}
export interface TraderUnlock {
  id: string;
  name: string;
}
export interface FinishRewards {
  traderStanding?: TraderStandingReward[];
  items?: ItemReward[];
  offerUnlock?: OfferUnlockReward[];
  skillLevelReward?: SkillLevelReward[];
  traderUnlock?: TraderUnlock;
}
export interface FinishReward {
  __typename?: string;
  status?: string;
  quest?: { id: string };
}
export interface RequiredKeyGroup {
  keys: TarkovItem[];
  maps?: { id: string; name?: string }[];
  optional?: boolean;
  anyOf?: boolean;
}
export interface Task {
  id: string;
  tarkovDataId?: number;
  name?: string;
  kappaRequired?: boolean;
  lightkeeperRequired?: boolean;
  experience?: number;
  map?: { id: string; name?: string };
  locations?: string[];
  trader?: { id: string; name?: string; normalizedName?: string; imageLink?: string };
  objectives?: TaskObjective[];
  taskRequirements?: TaskRequirement[];
  minPlayerLevel?: number;
  failedRequirements?: TaskRequirement[];
  traderLevelRequirements?: TaskTraderLevelRequirement[];
  traderRequirements?: TraderRequirement[];
  factionName?: string;
  startRewards?: FinishRewards;
  finishRewards?: FinishRewards;
  failConditions?: TaskObjective[];
  failureOutcome?: FinishRewards;
  traderIcon?: string;
  predecessors?: string[];
  successors?: string[];
  parents?: string[];
  children?: string[];
  neededBy?: string[];
  type?: string;
  wikiLink?: string;
  requiredKeys?: RequiredKeyGroup[];
  alternatives?: string[];
  /** Flag indicating the task is disabled or removed from standard gameplay */
  disabled?: boolean;
}
/**
 * 3D position coordinates used for map locations
 */
export interface MapPosition {
  x: number;
  y: number;
  z: number;
}
export interface MapSpawn {
  zoneName?: string;
  position: MapPosition;
  sides?: string[];
  categories?: string[];
}
/**
 * Extraction point on a map
 */
export interface MapExtract {
  id: string;
  name: string;
  /** Faction that can use this extract: 'pmc', 'scav', 'shared', or null */
  faction?: 'pmc' | 'scav' | 'shared' | null;
  /** Position on the map */
  position?: MapPosition;
  /** Top boundary for multi-floor extracts */
  top?: number;
  /** Bottom boundary for multi-floor extracts */
  bottom?: number;
}
export interface MapSvgConfig {
  file: string;
  floors: string[];
  defaultFloor: string;
  coordinateRotation: number;
  transform?: [number, number, number, number];
  bounds: [[number, number], [number, number]];
  svgBounds?: [[number, number], [number, number]];
  stackFloors?: boolean;
  minZoom?: number;
  maxZoom?: number;
}
export interface MapTileConfig {
  tilePath: string;
  tileFallbacks?: string[];
  coordinateRotation: number;
  transform?: [number, number, number, number];
  bounds: [[number, number], [number, number]];
  minZoom?: number;
  maxZoom?: number;
}
export interface TarkovMap {
  id: string;
  name: string;
  normalizedName?: string;
  spawns?: MapSpawn[];
  /** Extraction points available on this map */
  extracts?: MapExtract[];
  /** Whether the map is unavailable for display */
  unavailable?: boolean;
  svg?: string | MapSvgConfig;
  tile?: MapTileConfig;
}
export interface TraderLoyaltyLevel {
  id: string;
  level: number;
  requiredPlayerLevel: number;
  requiredReputation: number;
  requiredCommerce: number;
  payRate?: number;
}
export interface Trader {
  id: string;
  name: string;
  normalizedName?: string;
  imageLink?: string;
  levels?: TraderLoyaltyLevel[];
}
/**
 * Player level data with XP thresholds
 * Note: exp values are converted to cumulative totals by the metadata store
 * API returns per-level increments, but we store cumulative values for calculations
 */
export interface PlayerLevel {
  level: number; // Level number (1-79)
  exp: number; // Cumulative XP required to reach this level (transformed from API)
  levelBadgeImageLink: string;
}
// Prestige System Types
export interface PrestigeLevel {
  id: string;
  level: number; // 0-6
  name?: string;
  prestigeLevel?: number;
  imageLink?: string;
  iconLink?: string;
  conditions?: TaskObjective[];
  rewards?: unknown;
  transferSettings?: unknown[];
}
export interface TarkovPrestigeQueryResult {
  prestige: PrestigeLevel[];
}
export interface MemberProfile {
  displayName: string | null;
  level: number | null;
  tasksCompleted: number | null;
  gameMode?: 'pvp' | 'pve';
}
// Query Result Types
export interface LanguageQueryResult {
  __type?: { enumValues: { name: string }[] };
}
export interface TarkovDataQueryResult {
  tasks: Task[];
  maps: TarkovMap[];
  traders: Trader[];
  playerLevels?: PlayerLevel[];
}
export interface TarkovBootstrapQueryResult {
  playerLevels: PlayerLevel[];
}
export interface TarkovTasksCoreQueryResult {
  tasks: Task[];
  maps: TarkovMap[];
  traders: Trader[];
}
export interface TarkovMapSpawnsQueryResult {
  maps: Array<Pick<TarkovMap, 'id' | 'name' | 'spawns'>>;
}
export interface TarkovTaskObjectivesQueryResult {
  tasks: Array<Pick<Task, 'id' | 'objectives' | 'failConditions'>>;
}
export interface TarkovTaskRewardsQueryResult {
  tasks: Array<Pick<Task, 'id' | 'startRewards' | 'finishRewards' | 'failureOutcome'>>;
}
export interface TarkovHideoutQueryResult {
  hideoutStations: HideoutStation[];
}
export interface TarkovItemsQueryResult {
  items: TarkovItem[];
}
// Needed Items Types
export interface NeededItemBase {
  id: string;
  item: TarkovItem;
  count: number;
  foundInRaid?: boolean;
}
export interface NeededItemTaskObjective extends NeededItemBase {
  needType: 'taskObjective';
  taskId: string;
  teamId?: string | null;
  type?: string;
  markerItem?: TarkovItem;
}
export interface NeededItemHideoutModule extends NeededItemBase {
  needType: 'hideoutModule';
  hideoutModule: HideoutModule;
}
export type Need = NeededItemTaskObjective | NeededItemHideoutModule;
export type GroupedItemInfo = Pick<
  TarkovItem,
  'id' | 'iconLink' | 'image512pxLink' | 'wikiLink' | 'link'
> & {
  /** Item display name (required - items without names are filtered out during grouping) */
  name: string;
};
/**
 * Grouped needed item aggregating all requirements for a single item
 * across tasks and hideout modules.
 *
 * Counter field naming conventions:
 * - "Fir" = "Found in Raid" - items that must be found in raid for the requirement
 * - "Current" = player's current progress toward that specific requirement category
 */
export interface GroupedNeededItem {
  item: GroupedItemInfo;
  /** Total count of this item required for tasks with Found in Raid requirement */
  taskFir: number;
  /** Player's current progress toward task FIR requirements */
  taskFirCurrent: number;
  /** Total count of this item required for tasks without FIR requirement */
  taskNonFir: number;
  /** Player's current progress toward task non-FIR requirements */
  taskNonFirCurrent: number;
  /** Total count of this item required for hideout modules with FIR requirement */
  hideoutFir: number;
  /** Player's current progress toward hideout FIR requirements */
  hideoutFirCurrent: number;
  /** Total count of this item required for hideout modules without FIR requirement */
  hideoutNonFir: number;
  /** Player's current progress toward hideout non-FIR requirements */
  hideoutNonFirCurrent: number;
  /** Grand total of this item required (sum of taskFir + taskNonFir + hideoutFir + hideoutNonFir) */
  readonly total: number;
  /** Aggregate current progress (sum of all *Current fields) */
  readonly currentCount: number;
}
// Lookup Types
export interface ObjectiveMapInfo {
  objectiveID: string;
  mapID: string;
  x?: number;
  y?: number;
}
export interface ObjectiveGPSInfo {
  objectiveID: string;
  x?: number;
  y?: number;
}
export interface StaticMapData {
  [key: string]: {
    /** Whether the map is unavailable for display (e.g., unreleased maps) */
    unavailable?: boolean;
    svg?: MapSvgConfig;
    tile?: MapTileConfig;
  };
}
// Store Types
export interface SystemState extends StateTree {
  user_id?: string | null;
  tokens?: string[];
  team?: string | null;
  // Keep raw team_id from Supabase for backwards/compat and reactivity
  team_id?: string | null;
  // Game-mode-specific team IDs
  pvp_team_id?: string | null;
  pve_team_id?: string | null;
  // Admin status
  is_admin?: boolean;
}
export interface SystemGetters extends _GettersTree<SystemState> {
  userTokens: (state: SystemState) => string[];
  userTokenCount: (state: SystemState) => number;
  userTeam: (state: SystemState) => string | null;
  userTeamIsOwn: (state: SystemState) => boolean;
  isAdmin: (state: SystemState) => boolean;
}
export interface TeamState extends StateTree {
  owner?: string | null;
  joinCode?: string | null;
  members?: string[];
  memberProfiles?: Record<string, MemberProfile>;
}
export interface TeamGetters extends _GettersTree<TeamState> {
  teamOwner: (state: TeamState) => string | null;
  isOwner: (state: TeamState) => boolean;
  inviteCode: (state: TeamState) => string | null;
  teamMembers: (state: TeamState) => string[];
  teammates: (state: TeamState) => string[];
}
// Composable Return Types
export interface TarkovDataComposable {
  availableLanguages: Ref<string[] | null>;
  languageCode: ComputedRef<string>;
  queryErrors: Ref<Error | null | undefined>;
  queryResults: Ref<TarkovDataQueryResult | null>;
  lastQueryTime: Ref<number | null>;
  loading: Ref<boolean>;
  hideoutLoading: Ref<boolean>;
  queryHideoutErrors: Ref<Error | null | undefined>;
  queryHideoutResults: Ref<TarkovHideoutQueryResult | null>;
  lastHideoutQueryTime: Ref<number | null>;
  hideoutStations: Ref<HideoutStation[]>;
  hideoutModules: Ref<HideoutModule[]>;
  hideoutGraph: Ref<TaskGraph>;
  tasks: Ref<Task[]>;
  taskGraph: Ref<TaskGraph>;
  objectiveMaps: Ref<{ [taskId: string]: ObjectiveMapInfo[] }>;
  alternativeTasks: Ref<{ [taskId: string]: string[] }>;
  objectiveGPS: Ref<{ [taskId: string]: ObjectiveGPSInfo[] }>;
  mapTasks: Ref<{ [mapId: string]: string[] }>;
  objectives: ComputedRef<TaskObjective[]>;
  maps: ComputedRef<TarkovMap[]>;
  traders: ComputedRef<Trader[]>;
  neededItemTaskObjectives: Ref<NeededItemTaskObjective[]>;
  neededItemHideoutModules: Ref<NeededItemHideoutModule[]>;
  playerLevels: ComputedRef<PlayerLevel[]>;
  minPlayerLevel: ComputedRef<number>;
  maxPlayerLevel: ComputedRef<number>;
}
export interface LiveDataComposable {
  useTeamStore: () => Store<string, TeamState, TeamGetters>;
  useSystemStore: () => Store<string, SystemState, SystemGetters>;
  useProgressStore: () => Store<string, UserState>;
  teammateStores: Ref<Record<string, Store<string, UserState>>>;
  tarkovStore: Store<string, UserState>;
}
