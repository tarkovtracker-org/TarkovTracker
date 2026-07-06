// Environment bindings
export interface Env {
  API_GATEWAY_LIMITER: DurableObjectNamespace;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ALLOWED_ORIGIN?: string;
  API_HOST?: string;
  LEGACY_API_REDIRECT?: string;
}
// API Token from database
export interface ApiToken {
  token_id: string;
  user_id: string;
  token_hash: string;
  token_value?: string | null;
  permissions: string[];
  game_mode: 'pvp' | 'pve';
  note?: string | null;
  is_active: boolean;
  usage_count: number;
  last_used_at?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
}
// Permission codes
export type Permission = 'GP' | 'TP' | 'WP';
// Task status for updates
export type TaskState = 'completed' | 'uncompleted' | 'failed';
export interface ApiTaskUpdate {
  id: string;
  state: TaskState;
}
export interface ApiUpdateMeta {
  id: string;
  at: number;
  source: 'api';
  tasks?: ApiTaskUpdate[];
}
// Request body for batch task update
export interface BatchTaskUpdate {
  id: string;
  state: TaskState;
}
// User progress data structure (from Supabase)
export interface UserProgressData {
  level: number;
  pmcFaction: 'USEC' | 'BEAR';
  displayName: string | null;
  xpOffset: number;
  taskObjectives: Record<string, TaskObjective>;
  taskCompletions: Record<string, TaskCompletion>;
  hideoutParts: Record<string, HideoutPart>;
  hideoutModules: Record<string, HideoutModule>;
  traders: Record<string, TraderProgress>;
  skills: Record<string, number>;
  prestigeLevel: number;
  skillOffsets: Record<string, number>;
  lastApiUpdate?: ApiUpdateMeta;
}
export interface TaskCompletion {
  complete?: boolean;
  failed?: boolean;
  timestamp?: number;
}
export interface TaskObjective {
  complete?: boolean;
  count?: number;
  timestamp?: number;
}
export interface HideoutPart {
  complete?: boolean;
  count?: number;
}
export interface HideoutModule {
  complete?: boolean;
}
export interface TraderProgress {
  level?: number;
  reputation?: number;
}
// User progress row from Supabase
export interface UserProgressRow {
  user_id: string;
  current_game_mode: 'pvp' | 'pve' | null;
  game_edition: number | null;
  pvp_data: UserProgressData | null;
  pve_data: UserProgressData | null;
  created_at?: string | null;
  updated_at?: string | null;
}
// Legacy token response format (matching old API)
export interface LegacyTokenResponse {
  permissions: string[];
  token: string;
  owner: string;
  note: string;
  calls: number;
  gameMode: 'pvp' | 'pve';
}
export interface ProgressResponseTask {
  id: string;
  complete: boolean;
  invalid?: boolean;
  failed?: boolean;
}
export interface ProgressResponseObjective {
  id: string;
  complete: boolean;
  count?: number;
  invalid?: boolean;
}
export interface ProgressResponseHideoutModule {
  id: string;
  complete: boolean;
}
export interface ProgressResponseHideoutPart {
  id: string;
  complete: boolean;
  count?: number;
}
export interface ProgressResponseData {
  tasksProgress: ProgressResponseTask[];
  taskObjectivesProgress: ProgressResponseObjective[];
  hideoutModulesProgress: ProgressResponseHideoutModule[];
  hideoutPartsProgress: ProgressResponseHideoutPart[];
  displayName: string;
  userId: string;
  playerLevel: number;
  gameEdition: number;
  pmcFaction: string;
}
export interface ProgressResponseMeta {
  self: string;
  gameMode: string;
}
export interface ProgressResponse {
  data: ProgressResponseData;
  meta: ProgressResponseMeta;
}
// Tarkov.dev task data types
export interface TarkovTask {
  id: string;
  name: string;
  factionName?: string;
  alternatives?: string[];
  objectives?: TarkovObjective[];
  taskRequirements?: TarkovTaskRequirement[];
}
export interface TarkovObjective {
  id: string;
  type?: string;
  count?: number;
}
export interface TarkovTaskRequirement {
  task?: { id: string };
  status?: string[];
}
export interface TarkovHideoutStation {
  id: string;
  levels?: TarkovHideoutLevel[];
}
export interface TarkovHideoutLevel {
  id: string;
  level: number;
  itemRequirements?: TarkovItemRequirement[];
}
export interface TarkovItemRequirement {
  id: string;
  count: number;
}
