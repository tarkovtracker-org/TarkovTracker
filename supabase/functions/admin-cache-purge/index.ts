import {
  authenticateUser,
  handleCorsPreflight,
  validateMethod,
  createErrorResponse,
  createSuccessResponse,
  type AuthSuccess,
} from 'shared/auth';
// Cloudflare API configuration
const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4';
const EDGE_CACHE_PATH = '/__edge-cache/tarkov';
const TWITCH_CONFIG_CACHE_TAG = 'promoted-twitch-config';
const TWITCH_CONFIG_PATH = '/api/twitch/config';
const TWITCH_CONFIG_REPURGE_DELAY_MS = 6000;
const PURGE_TIMEOUT_MS = 8000;
const PURGE_CHUNK_SIZE = 30;
const TARKOV_CACHE_KEYS = [
  { key: 'bootstrap', includesGameMode: false },
  { key: 'tasks-core', includesGameMode: true },
  { key: 'tasks-objectives', includesGameMode: true },
  { key: 'tasks-rewards', includesGameMode: true },
  { key: 'hideout', includesGameMode: true },
  { key: 'items', includesGameMode: false },
  { key: 'items-lite', includesGameMode: false },
  { key: 'prestige', includesGameMode: false },
];
// Keep in sync with app/utils/constants.ts (API_SUPPORTED_LANGUAGES)
const TARKOV_LANGUAGES = [
  'cs',
  'de',
  'en',
  'es',
  'fr',
  'hu',
  'it',
  'ja',
  'ko',
  'pl',
  'pt',
  'ro',
  'ru',
  'sk',
  'tr',
  'zh',
];
const TARKOV_GAME_MODES = ['regular', 'pve'];
type PurgeType = 'all' | 'tarkov-data' | 'twitch-config';
interface PurgeRequest {
  purgeType: PurgeType;
}
interface CloudflarePurgeResponse {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
  result?: { id: string } | null;
}
interface EdgeRuntimeGlobal {
  EdgeRuntime?: {
    waitUntil<T>(promise: Promise<T>): void;
  };
}
type SupabaseClient = AuthSuccess['supabase'];
/**
 * Verify user has admin privileges
 */
async function verifyAdminStatus(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_system')
    .select('is_admin')
    .eq('user_id', userId)
    .single();
  if (error || !data) {
    console.error('[admin-cache-purge] Error checking admin status:', error);
    return false;
  }
  return data.is_admin === true;
}
/**
 * Log admin action to audit table
 */
async function logAdminAction(
  supabase: SupabaseClient,
  adminUserId: string,
  action: string,
  details: Record<string, unknown>,
  req: Request
): Promise<void> {
  try {
    const ipAddress =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0] ||
      'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    await supabase.from('admin_audit_log').insert({
      admin_user_id: adminUserId,
      action,
      details,
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  } catch (error) {
    // Log but don't fail the request if audit logging fails
    console.error('[admin-cache-purge] Failed to log audit action:', error);
  }
}
function errorResponse(code: number, message: string): CloudflarePurgeResponse {
  return { success: false, errors: [{ code, message }], messages: [] };
}
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
function invalidJsonResponse(err: unknown): CloudflarePurgeResponse {
  return errorResponse(500, `Invalid JSON response: ${errorMessage(err)}`);
}
function networkResponse(err: unknown): CloudflarePurgeResponse {
  if (isAbortError(err)) {
    return errorResponse(408, 'Request timed out after 8s');
  }
  return errorResponse(500, `Network error: ${errorMessage(err)}`);
}
async function parseResponse(response: Response): Promise<CloudflarePurgeResponse> {
  if (!response.ok) {
    const text = await response.text();
    return errorResponse(response.status, `Cloudflare API error (${response.status}): ${text}`);
  }
  try {
    return (await response.json()) as CloudflarePurgeResponse;
  } catch (err) {
    return invalidJsonResponse(err);
  }
}
async function purgeCloudflareCache(
  zoneId: string,
  apiToken: string,
  payload: Record<string, unknown>
): Promise<CloudflarePurgeResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PURGE_TIMEOUT_MS);
  try {
    const response = await fetch(`${CLOUDFLARE_API_URL}/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return await parseResponse(response);
  } catch (err) {
    return networkResponse(err);
  } finally {
    clearTimeout(timeoutId);
  }
}
function buildCacheOrigins(baseUrl: string): string[] {
  const parsed = new URL(baseUrl);
  const host = parsed.hostname;
  const portSuffix = parsed.port ? `:${parsed.port}` : '';
  const origins = [parsed.origin];
  if (host.startsWith('www.')) {
    origins.push(`${parsed.protocol}//${host.replace(/^www\./, '')}${portSuffix}`);
  } else {
    origins.push(`${parsed.protocol}//www.${host}${portSuffix}`);
  }
  return origins;
}
function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
function buildEntryUrls(
  cacheBase: string,
  entry: { key: string; includesGameMode: boolean }
): string[] {
  const urls: string[] = [];
  for (const lang of TARKOV_LANGUAGES) {
    if (entry.includesGameMode) {
      for (const gameMode of TARKOV_GAME_MODES) {
        urls.push(`${cacheBase}/${entry.key}-${lang}-${gameMode}`);
      }
    } else {
      urls.push(`${cacheBase}/${entry.key}-${lang}`);
    }
  }
  return urls;
}
function buildTarkovCacheUrls(baseUrl: string): string[] {
  const urls: string[] = [];
  for (const origin of buildCacheOrigins(baseUrl)) {
    const cacheBase = `${origin}${EDGE_CACHE_PATH}`;
    for (const entry of TARKOV_CACHE_KEYS) {
      urls.push(...buildEntryUrls(cacheBase, entry));
    }
  }
  return urls;
}
function buildTwitchConfigUrls(baseUrl: string): string[] {
  if (!baseUrl) return [];
  try {
    return buildCacheOrigins(baseUrl).map((origin) => `${origin}${TWITCH_CONFIG_PATH}`);
  } catch {
    return [];
  }
}
function combinePurgeFailures(
  first: CloudflarePurgeResponse,
  second: CloudflarePurgeResponse
): CloudflarePurgeResponse {
  return {
    success: false,
    errors: [...(first.errors ?? []), ...(second.errors ?? [])],
    messages: [],
  };
}
function purgeSuccessMessage(purgeType: PurgeType): string {
  if (purgeType === 'all') return 'All cache purged successfully';
  if (purgeType === 'twitch-config') return 'Twitch config cache purged successfully';
  return 'Tarkov data cache purged successfully';
}
/**
 * Purge entire Cloudflare cache for the zone
 */
function purgeAllCache(zoneId: string, apiToken: string): Promise<CloudflarePurgeResponse> {
  return purgeCloudflareCache(zoneId, apiToken, { purge_everything: true });
}
async function purgeTwitchConfigCache(
  zoneId: string,
  apiToken: string,
  baseUrl: string
): Promise<CloudflarePurgeResponse> {
  const tagPurge = await purgeCloudflareCache(zoneId, apiToken, {
    tags: [TWITCH_CONFIG_CACHE_TAG],
  });
  if (tagPurge.success) return tagPurge;
  const urls = buildTwitchConfigUrls(baseUrl);
  if (urls.length === 0) return tagPurge;
  const urlPurge = await purgeCloudflareCache(zoneId, apiToken, { files: urls });
  if (urlPurge.success) return urlPurge;
  return combinePurgeFailures(tagPurge, urlPurge);
}
function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
function scheduleBackgroundTask(task: () => Promise<unknown>): void {
  const { EdgeRuntime } = globalThis as unknown as EdgeRuntimeGlobal;
  if (!EdgeRuntime) {
    console.error('[admin-cache-purge] EdgeRuntime unavailable; delayed purge not scheduled');
    return;
  }
  const backgroundTask = task().catch((error) => {
    console.error('[admin-cache-purge] Delayed purge task rejected:', error);
  });
  try {
    EdgeRuntime.waitUntil(backgroundTask);
  } catch (error) {
    console.error('[admin-cache-purge] Failed to schedule delayed purge:', error);
  }
}
async function repurgeTwitchConfigCache(
  zoneId: string,
  apiToken: string,
  baseUrl: string
): Promise<void> {
  try {
    await wait(TWITCH_CONFIG_REPURGE_DELAY_MS);
    const result = await purgeTwitchConfigCache(zoneId, apiToken, baseUrl);
    if (!result.success) {
      console.error('[admin-cache-purge] Delayed Twitch config purge failed:', result.errors);
    }
  } catch (error) {
    console.error('[admin-cache-purge] Delayed Twitch config purge failed:', error);
  }
}
function markPurgeFailure(
  aggregate: CloudflarePurgeResponse,
  result: CloudflarePurgeResponse
): void {
  if (!result.success) {
    aggregate.success = false;
    aggregate.errors.push(...(result.errors ?? []));
  }
  aggregate.messages.push(...(result.messages ?? []));
}
function collectPurgeIds(ids: string[], result: CloudflarePurgeResponse): void {
  const id = result.result?.id;
  if (id) ids.push(id);
}
/**
 * Purge specific Tarkov data cache URLs
 */
async function purgeTarkovDataCache(
  zoneId: string,
  apiToken: string,
  baseUrl: string
): Promise<CloudflarePurgeResponse> {
  const aggregate: CloudflarePurgeResponse = {
    success: true,
    errors: [],
    messages: [],
    result: { id: '' },
  };
  const resultIds: string[] = [];
  for (const chunk of chunkArray(buildTarkovCacheUrls(baseUrl), PURGE_CHUNK_SIZE)) {
    const result = await purgeCloudflareCache(zoneId, apiToken, { files: chunk });
    markPurgeFailure(aggregate, result);
    collectPurgeIds(resultIds, result);
  }
  aggregate.result = { id: resultIds.join(',') };
  return aggregate;
}
Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCorsPreflight(req);
  if (corsResponse) return corsResponse;
  try {
    // Validate HTTP method
    const methodError = validateMethod(req, ['POST']);
    if (methodError) return methodError;
    // Authenticate user
    const authResult = await authenticateUser(req);
    if ('error' in authResult) {
      return createErrorResponse(authResult.error, authResult.status, req);
    }
    const { user, supabase } = authResult as AuthSuccess;
    // Verify admin status
    const isAdmin = await verifyAdminStatus(supabase, user.id);
    if (!isAdmin) {
      return createErrorResponse('Admin access required', 403, req);
    }
    // Parse request body
    const rawBody = await req.text();
    let body: Partial<PurgeRequest & { purge_type?: PurgeType }>;
    try {
      body = JSON.parse(rawBody) as Partial<PurgeRequest & { purge_type?: PurgeType }>;
      // Support both camelCase (new) and snake_case (legacy) for backward compatibility
      if (!body.purgeType && !body.purge_type) {
        body.purgeType = 'tarkov-data';
      } else if (!body.purgeType && body.purge_type) {
        body.purgeType = body.purge_type;
      }
    } catch (err) {
      console.warn(
        '[admin-cache-purge] JSON parse failed, defaulting to tarkov-data.',
        'Error:',
        err,
        'Body:',
        rawBody
      );
      body = { purgeType: 'tarkov-data' };
    }
    const purgeType = body.purgeType!;
    // Validate purge type
    if (!['all', 'tarkov-data', 'twitch-config'].includes(purgeType)) {
      return createErrorResponse(
        "Invalid purgeType. Must be 'all', 'tarkov-data', or 'twitch-config'",
        400,
        req
      );
    }
    // Get Cloudflare credentials
    const zoneId = Deno.env.get('CLOUDFLARE_ZONE_ID');
    const apiToken = Deno.env.get('CLOUDFLARE_API_TOKEN');
    if (!zoneId || !apiToken) {
      console.error('[admin-cache-purge] Missing Cloudflare credentials');
      return createErrorResponse('Cloudflare credentials not configured', 500, req);
    }
    const baseUrl = Deno.env.get('APP_URL')?.trim() ?? '';
    if (purgeType === 'tarkov-data') {
      if (!baseUrl) {
        console.error('[admin-cache-purge] Missing APP_URL');
        return createErrorResponse('Application URL not configured', 500, req);
      }
      try {
        const protocol = new URL(baseUrl).protocol;
        if (protocol !== 'http:' && protocol !== 'https:') {
          throw new Error('Unsupported APP_URL protocol');
        }
      } catch {
        console.error('[admin-cache-purge] Invalid APP_URL');
        return createErrorResponse('Application URL invalid', 500, req);
      }
    }
    // Execute cache purge
    let purgeResult: CloudflarePurgeResponse;
    if (purgeType === 'all') {
      purgeResult = await purgeAllCache(zoneId, apiToken);
    } else if (purgeType === 'twitch-config') {
      purgeResult = await purgeTwitchConfigCache(zoneId, apiToken, baseUrl);
    } else {
      purgeResult = await purgeTarkovDataCache(zoneId, apiToken, baseUrl);
    }
    if (purgeType === 'twitch-config' && purgeResult.success) {
      scheduleBackgroundTask(() => repurgeTwitchConfigCache(zoneId, apiToken, baseUrl));
    }
    // Log the admin action
    await logAdminAction(
      supabase,
      user.id,
      'cache_purge',
      {
        purgeType: purgeType,
        success: purgeResult.success,
        cloudflareResultId: purgeResult.result?.id,
        adminEmail: user.email ?? null,
      },
      req
    );
    // Check Cloudflare response
    if (!purgeResult.success) {
      const errors = purgeResult.errors || [];
      const errorMessages =
        errors.length > 0
          ? errors.map((e) => e.message).join(', ')
          : 'Unknown error (no details provided by Cloudflare)';
      console.error('[admin-cache-purge] Cloudflare purge failed:', errorMessages);
      return createErrorResponse(`Cache purge failed: ${errorMessages}`, 502, req);
    }
    return createSuccessResponse(
      {
        success: true,
        message: purgeSuccessMessage(purgeType),
        purgeType: purgeType,
        cloudflareResultId: purgeResult.result?.id,
        timestamp: new Date().toISOString(),
      },
      200,
      req
    );
  } catch (error) {
    console.error('[admin-cache-purge] Error:', error);
    return createErrorResponse('Internal server error', 500, req);
  }
});
