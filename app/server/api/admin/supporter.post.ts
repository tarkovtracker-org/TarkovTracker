import { createError, defineEventHandler, readBody } from 'h3';
import { createLogger } from '@/server/utils/logger';
import { VALID_TIERS } from '@/server/utils/stripeCheckoutValidation';
const logger = createLogger('AdminSupporter');
type SupporterTier = (typeof VALID_TIERS)[number];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface AdminSupporterBody {
  enabled?: unknown;
  targetUserId?: unknown;
  tier?: unknown;
}
interface SupabaseRow {
  [key: string]: unknown;
}
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const supabaseUrl = ((config.supabaseUrl as string) || '').replace(/\/$/, '');
  const serviceKey = (config.supabaseServiceKey as string) || '';
  if (!supabaseUrl || !serviceKey) {
    throw createError({ statusCode: 500, message: 'Supabase service config missing' });
  }
  const authUser = (event.context as { auth?: { user?: { id?: string; email?: string } } }).auth
    ?.user;
  const adminUserId = authUser?.id;
  if (!adminUserId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }
  const isAdmin = await getIsAdmin(supabaseUrl, serviceKey, adminUserId);
  if (!isAdmin) {
    throw createError({ statusCode: 403, message: 'Admin privileges required' });
  }
  const body = (await readBody(event)) as AdminSupporterBody;
  const targetUserId = readUuid(body.targetUserId, 'targetUserId');
  const tier = readTier(body.tier);
  const enabled = readEnabled(body.enabled);
  const expiresAt = enabled ? null : new Date().toISOString();
  const payload = {
    user_id: targetUserId,
    tier: enabled ? tier : 'supporter',
    status: enabled ? 'active' : 'expired',
    type: 'subscription',
    has_ever_supported: true,
    expires_at: expiresAt,
  };
  const updatedRows = await supabaseFetch<SupabaseRow[]>(
    supabaseUrl,
    serviceKey,
    `/rest/v1/supporters?on_conflict=user_id`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
    }
  );
  const updated = updatedRows[0];
  if (!updated) {
    throw createError({ statusCode: 502, message: 'Supporter update returned no row' });
  }
  await writeAuditLog(supabaseUrl, serviceKey, {
    adminUserId,
    action: 'supporter_override',
    details: {
      adminEmail: authUser.email ?? null,
      enabled,
      targetUserId,
      tier: payload.tier,
    },
  });
  return {
    supporter: {
      tier: updated.tier,
      status: updated.status,
      type: updated.type,
      hasEverSupported: updated.has_ever_supported,
      expiresAt: updated.expires_at,
      startedAt: updated.started_at,
    },
  };
});
async function getIsAdmin(
  supabaseUrl: string,
  serviceKey: string,
  userId: string
): Promise<boolean> {
  const rows = await supabaseFetch<Array<{ is_admin: boolean | null }>>(
    supabaseUrl,
    serviceKey,
    `/rest/v1/user_system?select=is_admin&user_id=eq.${encodeURIComponent(userId)}&limit=1`
  );
  return rows[0]?.is_admin === true;
}
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
    await supabaseFetch(supabaseUrl, serviceKey, '/rest/v1/admin_audit_log', {
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
    logger.warn('[AdminSupporter] Failed to write audit log', { error, action: payload.action });
  }
}
async function supabaseFetch<T>(
  supabaseUrl: string,
  serviceKey: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
  } catch (error) {
    logger.error('[AdminSupporter] Supabase request failed', { path, error });
    throw createError({ statusCode: 502, message: 'Supabase request failed' });
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    logger.warn('[AdminSupporter] Supabase request failed', {
      path,
      status: response.status,
      detail,
    });
    throw createError({ statusCode: 502, message: 'Supabase request failed' });
  }
  if (response.status === 204) {
    return null as T;
  }
  const text = await response.text();
  if (!text.trim()) {
    return null as T;
  }
  return JSON.parse(text) as T;
}
function readUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
    throw createError({ statusCode: 400, message: `Invalid ${field}` });
  }
  return value;
}
function readTier(value: unknown): SupporterTier {
  if (typeof value !== 'string' || !VALID_TIERS.includes(value as SupporterTier)) {
    throw createError({ statusCode: 400, message: 'Invalid tier' });
  }
  return value as SupporterTier;
}
function readEnabled(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw createError({ statusCode: 400, message: 'Invalid enabled flag' });
  }
  return value;
}
