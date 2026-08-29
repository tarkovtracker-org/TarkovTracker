import { defineEventHandler, getRequestHeader } from 'h3';
import { createAdminError, readAdminBody } from '@/server/utils/adminError';
import { adminSupabaseFetch, getIsAdmin, normalizeSupabaseUrl } from '@/server/utils/adminSupabase';
import { createLogger } from '@/server/utils/logger';
import { ADMIN_ERROR_CODES } from '@/utils/adminErrors';
import type { H3Event } from 'h3';
const logger = createLogger('AdminTwitchConfig');
const EDGE_FUNCTION_PATH = '/functions/v1/admin-cache-purge';
const PURGE_TIMEOUT_MS = 25_000;
const CHANNEL_REGEX = /^[a-z0-9_]{1,25}$/;
const DISPLAY_NAME_MAX_LENGTH = 50;
interface AdminTwitchConfigBody {
  channel?: unknown;
  displayName?: unknown;
  enabled?: unknown;
}
interface TwitchConfig {
  channel: string;
  displayName: string;
  enabled: boolean;
}
interface SettingRow {
  value: TwitchConfig;
  version: number;
}
interface AdminAuthUser {
  id?: string;
  email?: string;
}
interface UpdateResult {
  cacheInvalidated: boolean;
  config: TwitchConfig;
  version: number;
}
export default defineEventHandler(async (event): Promise<UpdateResult> => {
  try {
    return await handleUpdate(event);
  } catch (error) {
    logger.error('[AdminTwitchConfig] Failed to update Twitch config', {
      action: 'update_promoted_twitch_config',
      adminUserId: readAdminUserIdForLog(event),
      error,
    });
    throw error;
  }
});
async function handleUpdate(event: H3Event): Promise<UpdateResult> {
  const runtime = useRuntimeConfig(event) as Record<string, unknown>;
  const supabaseUrl = readSupabaseUrl(runtime);
  const serviceKey = readServiceKey(runtime);
  if (!supabaseUrl || !serviceKey) {
    throw createAdminError(
      500,
      ADMIN_ERROR_CODES.SERVICE_CONFIG_MISSING,
      'Supabase service config missing'
    );
  }
  const adminUserId = readAdminUserId(event);
  await requireAdmin(supabaseUrl, serviceKey, adminUserId);
  const input = readInput(await readAdminBody<AdminTwitchConfigBody>(event));
  const saved = await updateConfig(
    supabaseUrl,
    serviceKey,
    adminUserId,
    readAdminEmail(event),
    input
  );
  const cacheInvalidated = await purgeConfigCache(runtime, event);
  return { cacheInvalidated, config: saved.value, version: saved.version };
}
async function purgeConfigCache(
  runtime: Record<string, unknown>,
  event: H3Event
): Promise<boolean> {
  try {
    const supabaseUrl = readSupabaseUrl(runtime);
    if (!supabaseUrl) throw new Error('Cache purge config missing');
    await invokeCachePurge(supabaseUrl, readAnonKey(runtime), readAuthHeader(event));
    return true;
  } catch (error) {
    logger.error('[AdminTwitchConfig] Failed to purge Twitch config cache', {
      action: 'purge_promoted_twitch_config',
      adminUserId: readAdminUserIdForLog(event),
      error,
    });
    return false;
  }
}
function readAnonKey(runtime: Record<string, unknown>): string {
  return typeof runtime.supabaseAnonKey === 'string' ? runtime.supabaseAnonKey : '';
}
function readAuthHeader(event: H3Event): string {
  const authHeader = getRequestHeader(event, 'authorization');
  if (!authHeader) throw new Error('Cache purge authorization missing');
  return authHeader;
}
async function invokeCachePurge(
  supabaseUrl: string,
  anonKey: string,
  authHeader: string
): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PURGE_TIMEOUT_MS);
  try {
    const response = await fetch(`${supabaseUrl}${EDGE_FUNCTION_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ purgeType: 'twitch-config' }),
      signal: controller.signal,
    });
    if (response.ok) return;
    throw await buildPurgeFailureError(response);
  } finally {
    clearTimeout(timeoutId);
  }
}
async function buildPurgeFailureError(response: Response): Promise<Error> {
  const detail = await response.text().catch(() => '');
  const suffix = detail ? `: ${detail}` : '';
  return new Error(`Cache purge failed (${response.status})${suffix}`);
}
async function updateConfig(
  supabaseUrl: string,
  serviceKey: string,
  adminUserId: string,
  adminEmail: string | null,
  config: TwitchConfig
): Promise<SettingRow> {
  const rows = await adminSupabaseFetch<SettingRow[]>(
    supabaseUrl,
    serviceKey,
    '/rest/v1/rpc/update_promoted_twitch_config',
    {
      method: 'POST',
      body: JSON.stringify({
        p_value: config,
        p_admin_user_id: adminUserId,
        p_admin_email: adminEmail,
      }),
    }
  );
  const saved = rows?.[0];
  if (!saved) {
    throw createAdminError(
      502,
      ADMIN_ERROR_CODES.TWITCH_CONFIG_UPDATE_FAILED,
      'Twitch config update returned no row'
    );
  }
  return saved;
}
async function requireAdmin(
  supabaseUrl: string,
  serviceKey: string,
  adminUserId: string
): Promise<void> {
  const isAdmin = await getIsAdmin(supabaseUrl, serviceKey, adminUserId);
  if (!isAdmin) {
    throw createAdminError(
      403,
      ADMIN_ERROR_CODES.ADMIN_PRIVILEGES_REQUIRED,
      'Admin privileges required'
    );
  }
}
function readAdminUserId(event: H3Event): string {
  const user = (event.context as { auth?: { user?: AdminAuthUser } }).auth?.user;
  if (!user?.id) {
    throw createAdminError(
      401,
      ADMIN_ERROR_CODES.AUTHENTICATION_REQUIRED,
      'Authentication required'
    );
  }
  return user.id;
}
function readAdminEmail(event: H3Event): string | null {
  const user = (event.context as { auth?: { user?: AdminAuthUser } }).auth?.user;
  return user?.email ?? null;
}
function readAdminUserIdForLog(event: H3Event): string | null {
  const user = (event.context as { auth?: { user?: AdminAuthUser } }).auth?.user;
  return user?.id ?? null;
}
function readInput(body: AdminTwitchConfigBody): TwitchConfig {
  const channel = readChannel(body.channel);
  return {
    channel,
    displayName: readDisplayName(body.displayName, channel),
    enabled: readEnabled(body.enabled),
  };
}
function readSupabaseUrl(runtime: Record<string, unknown>): string {
  return normalizeSupabaseUrl(runtime.supabaseUrl);
}
function readServiceKey(runtime: Record<string, unknown>): string {
  const value = runtime.supabaseServiceKey;
  return typeof value === 'string' ? value : '';
}
function readChannel(value: unknown): string {
  if (typeof value !== 'string') {
    throw createAdminError(400, ADMIN_ERROR_CODES.INVALID_CHANNEL, 'Invalid channel');
  }
  const channel = value.trim().toLowerCase();
  if (!channel || !CHANNEL_REGEX.test(channel)) {
    throw createAdminError(400, ADMIN_ERROR_CODES.INVALID_CHANNEL, 'Invalid channel');
  }
  return channel;
}
function readOptionalString(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw createAdminError(400, ADMIN_ERROR_CODES.INVALID_DISPLAY_NAME, 'Invalid display name');
  }
  return value.trim();
}
function readDisplayName(value: unknown, channel: string): string {
  const trimmed = readOptionalString(value);
  if (!trimmed) return channel;
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    throw createAdminError(400, ADMIN_ERROR_CODES.INVALID_DISPLAY_NAME, 'Invalid display name');
  }
  return trimmed;
}
function readEnabled(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw createAdminError(400, ADMIN_ERROR_CODES.INVALID_ENABLED_FLAG, 'Invalid enabled flag');
  }
  return value;
}
