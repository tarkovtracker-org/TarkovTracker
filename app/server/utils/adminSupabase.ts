import { createError } from 'h3';
import { createLogger } from '@/server/utils/logger';
const logger = createLogger('AdminSupabase');
const SUPABASE_ADMIN_FETCH_TIMEOUT_MS = 5000;
function isHttpError(error: unknown): error is { statusCode: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
  );
}
/**
 * Shared Supabase REST helper for admin server routes. Uses the service-role
 * key, bounds the request with an AbortController timeout so a stalled upstream
 * cannot hang the handler, and normalizes failures to a 502. Returns `null` for
 * empty/`204` bodies so callers using `Prefer: return=minimal` behave.
 */
export async function adminSupabaseFetch<T>(
  supabaseUrl: string,
  serviceKey: string,
  path: string,
  init: RequestInit = {}
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_ADMIN_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${supabaseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.error('Supabase request error', {
        path,
        status: response.status,
        body: body.slice(0, 300),
      });
      throw createError({ statusCode: 502, message: 'Supabase request failed' });
    }
    if (response.status === 204) {
      return null;
    }
    const text = await response.text();
    if (!text.trim()) {
      return null;
    }
    return JSON.parse(text) as T;
  } catch (error) {
    if (isHttpError(error)) {
      throw error;
    }
    logger.error('Supabase request failed', { path, error });
    throw createError({ statusCode: 502, message: 'Supabase request failed' });
  } finally {
    clearTimeout(timeout);
  }
}
/**
 * Resolve whether the given user is a TarkovTracker admin via `public.user_system`.
 * Shared by the admin server routes so the gate lives in exactly one place.
 */
export async function getIsAdmin(
  supabaseUrl: string,
  serviceKey: string,
  userId: string
): Promise<boolean> {
  const rows = await adminSupabaseFetch<Array<{ is_admin: boolean | null }>>(
    supabaseUrl,
    serviceKey,
    `/rest/v1/user_system?select=is_admin&user_id=eq.${encodeURIComponent(userId)}&limit=1`
  );
  return rows?.[0]?.is_admin === true;
}
