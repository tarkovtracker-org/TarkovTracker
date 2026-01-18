import { defineEventHandler, setResponseHeaders } from 'h3';
import { useRuntimeConfig } from '#imports';
import { createLogger } from '~/server/utils/logger';
const logger = createLogger('TarkovCacheMeta');
export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { 'Cache-Control': 'no-store' });
  const config = useRuntimeConfig(event);
  const supabaseUrl = config.supabaseUrl;
  const supabaseServiceKey = config.supabaseServiceKey;
  if (typeof supabaseUrl !== 'string' || typeof supabaseServiceKey !== 'string') {
    logger.error('[CacheMeta] Missing Supabase configuration for cache meta lookup.', {
      supabaseUrlPresent: Boolean(supabaseUrl),
      supabaseServiceKeyPresent: Boolean(supabaseServiceKey),
    });
    return { data: { lastPurgeAt: null } };
  }
  const url = new URL(`${supabaseUrl}/rest/v1/admin_audit_log`);
  url.searchParams.set('select', 'created_at,details');
  url.searchParams.set('action', 'eq.cache_purge');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '10');
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  } catch (error) {
    logger.error('[CacheMeta] Network error fetching cache meta.', {
      url: url.toString(),
      error: error instanceof Error ? error.message : String(error),
    });
    return { data: { lastPurgeAt: null } };
  }
  if (!response.ok) {
    let bodySnippet = '';
    try {
      bodySnippet = await response.text();
      if (bodySnippet.length > 200) {
        bodySnippet = bodySnippet.slice(0, 200) + '...';
      }
    } catch {
      bodySnippet = '[unable to read response body]';
    }
    logger.error('[CacheMeta] Non-OK response from Supabase.', {
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
    logger.error('[CacheMeta] Failed to parse JSON response.', {
      url: url.toString(),
      error: error instanceof Error ? error.message : String(error),
    });
    return { data: { lastPurgeAt: null } };
  }
  if (!Array.isArray(parsed)) {
    logger.error('[CacheMeta] Expected array response but got non-array.', {
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
});
