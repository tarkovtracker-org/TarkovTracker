import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  authenticateUser,
  handleCorsPreflight,
  validateMethod,
  createErrorResponse,
  createSuccessResponse,
  type AuthSuccess,
} from '../_shared/auth.ts';

// Cloudflare API configuration
const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4';

const EDGE_CACHE_PATH = '/__edge-cache/tarkov';
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

interface PurgeRequest {
  purgeType: 'all' | 'tarkov-data';
}

interface CloudflarePurgeResponse {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
  result?: { id: string } | null;
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

/**
 * Purge entire Cloudflare cache for the zone
 */
async function purgeAllCache(zoneId: string, apiToken: string): Promise<CloudflarePurgeResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${CLOUDFLARE_API_URL}/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ purge_everything: true }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        errors: [
          { code: response.status, message: `Cloudflare API error (${response.status}): ${text}` },
        ],
        messages: [],
      };
    }

    try {
      return (await response.json()) as CloudflarePurgeResponse;
    } catch (e) {
      return {
        success: false,
        errors: [
          {
            code: 500,
            message: `Invalid JSON response: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
        messages: [],
      };
    }
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';
    return {
      success: false,
      errors: [
        {
          code: isTimeout ? 408 : 500,
          message: isTimeout
            ? 'Request timed out after 8s'
            : `Network error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      messages: [],
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Purge specific Tarkov data cache URLs
 */
async function purgeTarkovDataCache(
  zoneId: string,
  apiToken: string,
  baseUrl: string
): Promise<CloudflarePurgeResponse> {
  const normalizedBaseUrl = baseUrl.trim();
  const baseUrls = (() => {
    try {
      const parsed = new URL(normalizedBaseUrl);
      const origins = new Set<string>();
      origins.add(parsed.origin);
      const host = parsed.hostname;
      const portSuffix = parsed.port ? `:${parsed.port}` : '';
      if (host.startsWith('www.')) {
        origins.add(`${parsed.protocol}//${host.replace(/^www\./, '')}${portSuffix}`);
      } else {
        origins.add(`${parsed.protocol}//www.${host}${portSuffix}`);
      }
      return Array.from(origins);
    } catch {
      return ['https://tarkovtracker.org', 'https://www.tarkovtracker.org'];
    }
  })();

  const urlsToPurge: string[] = [];

  for (const base of baseUrls) {
    const cacheBase = `${base}${EDGE_CACHE_PATH}`;
    for (const entry of TARKOV_CACHE_KEYS) {
      for (const lang of TARKOV_LANGUAGES) {
        if (entry.includesGameMode) {
          for (const gameMode of TARKOV_GAME_MODES) {
            urlsToPurge.push(`${cacheBase}/${entry.key}-${lang}-${gameMode}`);
          }
        } else {
          urlsToPurge.push(`${cacheBase}/${entry.key}-${lang}`);
        }
      }
    }
  }

  // Cloudflare limits files to 30 per call
  const CHUNK_SIZE = 30;
  const chunks: string[][] = [];
  for (let i = 0; i < urlsToPurge.length; i += CHUNK_SIZE) {
    chunks.push(urlsToPurge.slice(i, i + CHUNK_SIZE));
  }

  const aggregatedResult: CloudflarePurgeResponse = {
    success: true,
    errors: [],
    messages: [],
    result: { id: '' },
  };

  const resultIds: string[] = [];

  // Execute purge for each chunk
  for (const chunk of chunks) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${CLOUDFLARE_API_URL}/zones/${zoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files: chunk }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        aggregatedResult.success = false;
        aggregatedResult.errors.push({
          code: response.status,
          message: `Cloudflare API error (${response.status} ${response.statusText}): ${text}`,
        });
        continue;
      }

      let data: CloudflarePurgeResponse;
      try {
        data = (await response.json()) as CloudflarePurgeResponse;
      } catch (e) {
        aggregatedResult.success = false;
        aggregatedResult.errors.push({
          code: 500,
          message: `Invalid JSON response: ${e instanceof Error ? e.message : String(e)}`,
        });
        continue;
      }

      if (!data.success) {
        aggregatedResult.success = false;
        if (data.errors) {
          aggregatedResult.errors.push(...data.errors);
        }
      }

      if (data.messages) {
        aggregatedResult.messages.push(...data.messages);
      }

      if (data.result?.id) {
        resultIds.push(data.result.id);
      }
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      console.error('[admin-cache-purge] Error purging chunk:', err);
      aggregatedResult.success = false;
      aggregatedResult.errors.push({
        code: isTimeout ? 408 : 500,
        message: isTimeout
          ? 'Request timed out after 8s'
          : `Network error: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Combine IDs from all successful chunks
  aggregatedResult.result = { id: resultIds.join(',') };

  return aggregatedResult;
}

serve(async (req) => {
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
    let body: Partial<PurgeRequest & { purge_type?: 'all' | 'tarkov-data' }>;
    try {
      body = JSON.parse(rawBody) as Partial<PurgeRequest & { purge_type?: 'all' | 'tarkov-data' }>;
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
    if (!['all', 'tarkov-data'].includes(purgeType)) {
      return createErrorResponse("Invalid purgeType. Must be 'all' or 'tarkov-data'", 400, req);
    }

    // Get Cloudflare credentials
    const zoneId = Deno.env.get('CLOUDFLARE_ZONE_ID');
    const apiToken = Deno.env.get('CLOUDFLARE_API_TOKEN');

    if (!zoneId || !apiToken) {
      console.error('[admin-cache-purge] Missing Cloudflare credentials');
      return createErrorResponse('Cloudflare credentials not configured', 500, req);
    }

    // Get base URL for cache key construction
    const baseUrl =
      Deno.env.get('APP_BASE_URL') ||
      Deno.env.get('NUXT_PUBLIC_APP_URL') ||
      Deno.env.get('SITE_URL') ||
      'https://tarkovtracker.org';

    // Execute cache purge
    let purgeResult: CloudflarePurgeResponse;

    if (purgeType === 'all') {
      purgeResult = await purgeAllCache(zoneId, apiToken);
    } else {
      purgeResult = await purgeTarkovDataCache(zoneId, apiToken, baseUrl);
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
        message:
          purgeType === 'all'
            ? 'All cache purged successfully'
            : 'Tarkov data cache purged successfully',
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
