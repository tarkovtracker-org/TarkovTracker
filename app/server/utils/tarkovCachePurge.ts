import type { H3Event } from 'h3';
import { normalizeSupabaseUrl } from '~/server/utils/adminSupabase';
import { createLogger } from '~/server/utils/logger';
const logger = createLogger('TarkovCacheMeta');
function buildAuditQuery(event: H3Event) {
  const config = useRuntimeConfig(event);
  const supabaseUrl = normalizeSupabaseUrl(config.supabaseUrl);
  const serviceKey =
    typeof config.supabaseServiceKey === 'string' ? config.supabaseServiceKey.trim() : '';
  if (!supabaseUrl || !serviceKey) {
    logger.warn('Supabase not configured - skipping cache meta lookup');
    return null;
  }
  const url = new URL(`${supabaseUrl}/rest/v1/admin_audit_log`);
  url.searchParams.set('select', 'created_at,details');
  url.searchParams.set('action', 'eq.cache_purge');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('details', 'cs.{"success":true}');
  url.searchParams.set('limit', '1');
  return { url, serviceKey };
}
export async function readTarkovCacheMeta(event: H3Event) {
  const query = buildAuditQuery(event);
  if (!query) return { data: { lastPurgeAt: null } };
  const { url, serviceKey } = query;
  let response: Response;
  const requestTimeoutMs = 2500;
  try {
    const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
    response = await fetch(url.toString(), {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      signal: timeoutSignal,
    });
  } catch (error) {
    if (
      (error instanceof Error && error.name === 'AbortError') ||
      (error instanceof DOMException && error.name === 'TimeoutError')
    ) {
      logger.warn(`Cache meta request timed out after ${requestTimeoutMs}ms.`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        data: { lastPurgeAt: null },
        error: `Cache meta request timed out after ${requestTimeoutMs}ms.`,
      };
    }
    logger.error('Network error fetching cache meta.', {
      url: url.toString(),
      error: error instanceof Error ? error.message : String(error),
    });
    return { data: { lastPurgeAt: null } };
  }
  return readAuditResponse(response, url);
}
async function readAuditResponse(response: Response, url: URL) {
  if (!response.ok) {
    let bodySnippet: string;
    try {
      bodySnippet = await response.text();
      if (bodySnippet.length > 200) {
        bodySnippet = bodySnippet.slice(0, 200) + '...';
      }
    } catch {
      bodySnippet = '[unable to read response body]';
    }
    logger.error('Non-OK response from Supabase.', {
      url: url.toString(),
      status: response.status,
      body: bodySnippet,
    });
    return { data: { lastPurgeAt: null } };
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (error) {
    logger.error('Failed to parse JSON response.', {
      url: url.toString(),
      error: error instanceof Error ? error.message : String(error),
    });
    return { data: { lastPurgeAt: null } };
  }
  if (!Array.isArray(parsed)) {
    logger.error('Expected array response but got non-array.', {
      url: url.toString(),
      type: typeof parsed,
    });
    return { data: { lastPurgeAt: null } };
  }
  const rows = parsed as Array<{
    created_at?: string | null;
    details?: { success?: boolean } | null;
  }>;
  const lastSuccessful = rows.find((row) => {
    if (row === null || typeof row !== 'object') return false;
    const details = row.details;
    return details !== null && typeof details === 'object' && details.success === true;
  });
  return { data: { lastPurgeAt: lastSuccessful?.created_at ?? null } };
}
