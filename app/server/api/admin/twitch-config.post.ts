import { createError, defineEventHandler, readBody } from 'h3';
import { adminSupabaseFetch, getIsAdmin } from '@/server/utils/adminSupabase';
import { createLogger } from '@/server/utils/logger';
import type { H3Event } from 'h3';
const logger = createLogger('AdminTwitchConfig');
const CHANNEL_REGEX = /^[a-z0-9_]{1,25}$/;
const SETTING_KEY = 'promoted_twitch';
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
}
interface AdminAuthUser {
  id?: string;
  email?: string;
}
export default defineEventHandler(async (event) => {
  const runtime = useRuntimeConfig(event) as Record<string, unknown>;
  const supabaseUrl = readSupabaseUrl(runtime);
  const serviceKey = readServiceKey(runtime);
  if (!supabaseUrl || !serviceKey) {
    throw createError({ statusCode: 500, message: 'Supabase service config missing' });
  }
  const adminUserId = readAdminUserId(event);
  await requireAdmin(supabaseUrl, serviceKey, adminUserId);
  const input = readInput(await readBody(event));
  const saved = await upsertConfig(supabaseUrl, serviceKey, adminUserId, input);
  await writeAuditLog(supabaseUrl, serviceKey, {
    adminUserId,
    action: 'twitch_config_update',
    details: { adminEmail: readAdminEmail(event), ...saved },
  });
  return { config: saved };
});
async function writeAuditLog(
  supabaseUrl: string,
  serviceKey: string,
  payload: {
    action: string;
    adminUserId: string;
    details: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await adminSupabaseFetch(supabaseUrl, serviceKey, '/rest/v1/admin_audit_log', {
      method: 'POST',
      body: JSON.stringify({
        action: payload.action,
        admin_user_id: payload.adminUserId,
        details: payload.details,
      }),
      headers: {
        Prefer: 'return=minimal',
      },
    });
  } catch (error) {
    logger.warn('[AdminTwitchConfig] Failed to write audit log', {
      error,
      action: payload.action,
    });
  }
}
async function upsertConfig(
  supabaseUrl: string,
  serviceKey: string,
  adminUserId: string,
  config: TwitchConfig
): Promise<TwitchConfig> {
  const rows = await adminSupabaseFetch<SettingRow[]>(
    supabaseUrl,
    serviceKey,
    `/rest/v1/app_settings?on_conflict=key`,
    {
      method: 'POST',
      body: JSON.stringify({
        key: SETTING_KEY,
        value: config,
        updated_at: new Date().toISOString(),
        updated_by: adminUserId,
      }),
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
    }
  );
  const saved = rows?.[0]?.value;
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
function readInput(body: AdminTwitchConfigBody): TwitchConfig {
  const channel = readChannel(body.channel);
  return {
    channel,
    displayName: readDisplayName(body.displayName, channel),
    enabled: readEnabled(body.enabled),
  };
}
function readSupabaseUrl(runtime: Record<string, unknown>): string {
  const value = runtime.supabaseUrl;
  return typeof value === 'string' ? value.replace(/\/$/, '') : '';
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
function readDisplayName(value: unknown, channel: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : null;
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
