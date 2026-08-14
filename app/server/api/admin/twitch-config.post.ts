import { createError, defineEventHandler, readBody } from 'h3';
import { adminSupabaseFetch, getIsAdmin, normalizeSupabaseUrl } from '@/server/utils/adminSupabase';
import { createLogger } from '@/server/utils/logger';
import type { H3Event } from 'h3';
const logger = createLogger('AdminTwitchConfig');
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
export default defineEventHandler(async (event) => {
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
async function handleUpdate(event: H3Event): Promise<{ config: TwitchConfig; version: number }> {
  const runtime = useRuntimeConfig(event) as Record<string, unknown>;
  const supabaseUrl = readSupabaseUrl(runtime);
  const serviceKey = readServiceKey(runtime);
  if (!supabaseUrl || !serviceKey) {
    throw createError({ statusCode: 500, message: 'Supabase service config missing' });
  }
  const adminUserId = readAdminUserId(event);
  await requireAdmin(supabaseUrl, serviceKey, adminUserId);
  const input = readInput((await readBody(event)) ?? {});
  const saved = await updateConfig(
    supabaseUrl,
    serviceKey,
    adminUserId,
    readAdminEmail(event),
    input
  );
  return { config: saved.value, version: saved.version };
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
    throw createError({ statusCode: 502, message: 'Twitch config update returned no row' });
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
    throw createError({ statusCode: 403, message: 'Admin privileges required' });
  }
}
function readAdminUserId(event: H3Event): string {
  const user = (event.context as { auth?: { user?: AdminAuthUser } }).auth?.user;
  if (!user?.id) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
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
    throw createError({ statusCode: 400, message: 'Invalid channel' });
  }
  const channel = value.trim().toLowerCase();
  if (!channel || !CHANNEL_REGEX.test(channel)) {
    throw createError({ statusCode: 400, message: 'Invalid channel' });
  }
  return channel;
}
function readOptionalString(value: unknown, message: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw createError({ statusCode: 400, message });
  }
  return value.trim();
}
function readDisplayName(value: unknown, channel: string): string {
  const trimmed = readOptionalString(value, 'Invalid display name');
  if (!trimmed) return channel;
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    throw createError({ statusCode: 400, message: 'Invalid display name' });
  }
  return trimmed;
}
function readEnabled(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw createError({ statusCode: 400, message: 'Invalid enabled flag' });
  }
  return value;
}
