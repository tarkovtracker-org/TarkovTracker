import { defineEventHandler, setResponseHeaders } from 'h3';
import { createLogger } from '~/server/utils/logger';
const logger = createLogger('TarkovCacheMeta');
export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { 'Cache-Control': 'no-store' });
  const config = useRuntimeConfig(event);
  const supabaseUrl = config.supabaseUrl;
  const supabaseServiceKey = config.supabaseServiceKey;
  if (
    typeof supabaseUrl !== 'string' ||
    !supabaseUrl.trim() ||
    typeof supabaseServiceKey !== 'string' ||
    !supabaseServiceKey.trim()
  ) {
    logger.warn('Supabase not configured - skipping cache meta lookup');
    return { data: { lastPurgeAt: null } };
  }
  const supabaseUrlValue = supabaseUrl.trim();
  const supabaseServiceKeyValue = supabaseServiceKey.trim();
  let url: URL;
  try {
    url = new URL(`${supabaseUrlValue}/rest/v1/admin_audit_log`);
  } catch (error) {
    logger.error('Invalid Supabase URL for cache meta lookup.', {
      supabaseUrl: supabaseUrlValue,
      error: error instanceof Error ? error.message : String(error),
    });
    return { data: { lastPurgeAt: null } };
  }
  url.searchParams.set('select', 'created_at,details');
  url.searchParams.set('action', 'eq.cache_purge');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '10');
  let response: Response;
  const requestTimeoutMs = 2500;
  try {
    const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
    response = await fetch(url.toString(), {
      headers: {
        apikey: supabaseServiceKeyValue,
        Authorization: `Bearer ${supabaseServiceKeyValue}`,
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
});
