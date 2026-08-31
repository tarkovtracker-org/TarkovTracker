import { createAdminError } from '@/server/utils/adminError';
import { createLogger } from '@/server/utils/logger';
import { ADMIN_ERROR_CODES } from '@/utils/adminErrors';
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
 * Normalize a configured Supabase base URL into a safe prefix for REST paths.
 * Drops any query string or fragment and the trailing slash so appending
 * `/rest/v1/...` cannot land after a `?` or `#`. Returns `''` when the value is
 * missing, is not a parseable absolute URL, or does not use HTTPS so callers fail closed.
 */
export function normalizeSupabaseUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
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
      throw createAdminError(
        502,
        ADMIN_ERROR_CODES.SUPABASE_REQUEST_FAILED,
        'Supabase request failed'
      );
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
    throw createAdminError(
      502,
      ADMIN_ERROR_CODES.SUPABASE_REQUEST_FAILED,
      'Supabase request failed'
    );
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
