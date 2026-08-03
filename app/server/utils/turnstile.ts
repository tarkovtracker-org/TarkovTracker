import { createLogger } from '@/server/utils/logger';
const logger = createLogger('Turnstile');
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const SITEVERIFY_TIMEOUT_MS = 5000;
export type TurnstileVerification =
  { ok: true } | { ok: false; reason: 'missing-token' | 'invalid-token' | 'hostname-mismatch' };
type SiteverifyResponse = {
  success?: boolean;
  hostname?: string;
  'error-codes'?: string[];
};
const isSiteverifyResponse = (value: unknown): value is SiteverifyResponse => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if ('success' in candidate && typeof candidate.success !== 'boolean') return false;
  if ('hostname' in candidate && typeof candidate.hostname !== 'string') return false;
  if (
    'error-codes' in candidate &&
    (!Array.isArray(candidate['error-codes']) ||
      !candidate['error-codes'].every((code) => typeof code === 'string'))
  ) {
    return false;
  }
  return true;
};
const isAllowedHostname = (hostname: string | undefined, allowedHostnames: string[]): boolean => {
  if (allowedHostnames.length === 0) return true;
  if (!hostname) return false;
  const normalized = hostname.toLowerCase();
  return allowedHostnames.some((allowed) => normalized === allowed);
};
export const verifyTurnstileToken = async (options: {
  secretKey: string;
  token: string | null | undefined;
  allowedHostnames?: string[];
  remoteIp?: string | null;
}): Promise<TurnstileVerification> => {
  const token = options.token?.trim() ?? '';
  if (!token) {
    return { ok: false, reason: 'missing-token' };
  }
  if (token.length > 2048) {
    return { ok: false, reason: 'invalid-token' };
  }
  const requestBody = new URLSearchParams({ secret: options.secretKey, response: token });
  if (options.remoteIp) {
    requestBody.set('remoteip', options.remoteIp);
  }
  let payload: SiteverifyResponse;
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body: requestBody,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`siteverify responded ${response.status}`);
    }
    const parsedPayload = (await response.json()) as unknown;
    if (!isSiteverifyResponse(parsedPayload)) {
      throw new Error('siteverify returned malformed JSON');
    }
    payload = parsedPayload;
  } catch (error) {
    // siteverify outages fail open: Turnstile is an abuse gate, not an integrity boundary.
    logger.warn('Turnstile siteverify unavailable; allowing request', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: true };
  }
  if (payload.success !== true) {
    return { ok: false, reason: 'invalid-token' };
  }
  if (!isAllowedHostname(payload.hostname, options.allowedHostnames ?? [])) {
    return { ok: false, reason: 'hostname-mismatch' };
  }
  return { ok: true };
};
