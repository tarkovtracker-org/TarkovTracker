/**
 * API Protection Middleware
 *
 * Protects API endpoints with multiple layers of security:
 * 1. Host header validation against allowed domain whitelist
 * 2. Optional client IP validation against trusted ranges
 * 3. Authentication enforcement for protected routes
 *
 * Security principle: Fail closed - deny access when any required check fails.
 */
import {
  createError,
  defineEventHandler,
  getRequestHeader,
  getRequestURL,
  setResponseHeader,
  setResponseStatus,
  type H3Event,
} from 'h3';
import ipaddr from 'ipaddr.js';
import { useRuntimeConfig } from '#imports';
// Type for runtime config API protection settings
interface ApiProtectionConfig {
  allowedHosts: string;
  trustedIpRanges: string;
  requireAuth: boolean;
  publicRoutes: string;
  trustProxy: boolean;
}
/**
 * Parse a comma-separated string into an array of trimmed, non-empty values
 */
function parseCommaSeparated(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
/**
 * Check if a route matches a pattern (supports * wildcard at end)
 * e.g., "/api/tarkov/*" matches "/api/tarkov/items" and "/api/tarkov/tasks-core"
 */
function routeMatchesPattern(route: string, pattern: string): boolean {
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1); // Remove the '*', keep the '/'
    return route.startsWith(prefix) || route === pattern.slice(0, -2);
  }
  return route === pattern;
}
/**
 * Check if a route is in the public routes list
 */
function isPublicRoute(pathname: string, publicRoutes: string[]): boolean {
  return publicRoutes.some((pattern) => routeMatchesPattern(pathname, pattern));
}
/**
 * Check if an IP is within a CIDR range or matches a single IP
 */
function ipInRange(clientIp: string, range: string): boolean {
  try {
    const addr = ipaddr.process(clientIp);
    const [rangeIp, cidrStr] = range.split('/');
    if (!cidrStr) {
      // Single IP exact match
      const rangeAddr = ipaddr.process(rangeIp);
      return addr.toString() === rangeAddr.toString();
    }
    const rangeAddr = ipaddr.parse(rangeIp);
    const cidr = parseInt(cidrStr, 10);
    // Families must match for CIDR check
    if (addr.kind() !== rangeAddr.kind()) {
      return false;
    }
    // Perform CIDR match using the library
    if (addr.kind() === 'ipv4') {
      return (addr as ipaddr.IPv4).match(rangeAddr as ipaddr.IPv4, cidr);
    }
    return (addr as ipaddr.IPv6).match(rangeAddr as ipaddr.IPv6, cidr);
  } catch {
    // Return false for any parsing errors
    return false;
  }
}
/**
 * Check if client IP is in any of the trusted ranges
 * Returns true if trustedRanges is empty (bypassed)
 */
function isIpTrusted(clientIp: string | null, trustedRanges: string[]): boolean {
  // If no trusted ranges configured, skip IP check
  if (trustedRanges.length === 0) {
    return true;
  }
  // If we have ranges but no IP, it's not trusted
  if (!clientIp) {
    return false;
  }
  return trustedRanges.some((range) => ipInRange(clientIp, range));
}
/**
 * Extract client IP from request headers or socket
 *
 * SECURITY: IP-based protection must ONLY be enabled when the server is behind a
 * trusted proxy (e.g., Cloudflare, Nginx) that guarantees the integrity of
 * forwarded IP headers. If trustProxy is false, headers like X-Forwarded-For
 * are ignored as they can be easily spoofed by clients.
 */
function getClientIp(event: H3Event, trustProxy: boolean = false): string | null {
  if (trustProxy) {
    // Cloudflare's connecting IP header (most reliable when behind CF)
    const cfConnectingIp = getRequestHeader(event, 'cf-connecting-ip');
    if (cfConnectingIp) return cfConnectingIp;
    // X-Forwarded-For can contain multiple IPs: client, proxy1, proxy2
    // The first one is typically the original client
    const xForwardedFor = getRequestHeader(event, 'x-forwarded-for');
    if (xForwardedFor) {
      const firstIp = xForwardedFor.split(',')[0]?.trim();
      if (firstIp) return firstIp;
    }
    // X-Real-IP is often set by nginx
    const xRealIp = getRequestHeader(event, 'x-real-ip');
    if (xRealIp) return xRealIp;
  }
  // Fallback to socket remote address
  // Note: node.req.socket is available in standard Node.js environments
  // In Cloudflare Workers/Pages, the IP is usually only in headers (which we check if trustProxy is true)
  return event.node.req?.socket?.remoteAddress || null;
}
/**
 * Validate the Host header against allowed hosts
 */
function isHostAllowed(
  hostHeader: string | undefined,
  allowedHosts: string[],
  isDevelopment: boolean
): boolean {
  // In development, always allow localhost variants
  if (isDevelopment) {
    if (!hostHeader) return true;
    const host = hostHeader.split(':')[0]; // Remove port
    if (host === 'localhost' || host === '127.0.0.1') return true;
  }
  // If no allowed hosts configured, fail closed in production
  if (allowedHosts.length === 0) {
    // In development without config, allow all
    return isDevelopment;
  }
  if (!hostHeader) {
    // No Host header - fail closed
    return false;
  }
  // Extract hostname (remove port if present)
  const host = hostHeader.split(':')[0].toLowerCase();
  return allowedHosts.some((allowed) => {
    const allowedLower = allowed.toLowerCase();
    // Exact match or subdomain match (e.g., "tarkovtracker.org" matches "www.tarkovtracker.org")
    return host === allowedLower || host.endsWith('.' + allowedLower);
  });
}
/**
 * Validate authentication token
 * Returns user info if valid, null otherwise
 */
async function validateAuthToken(
  authHeader: string | undefined,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<{ id: string } | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[API Protection] Supabase configuration missing for auth validation');
    return null;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey: supabaseAnonKey,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const user = (await response.json()) as { id: string };
    return user?.id ? user : null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[API Protection] Auth validation timed out after 5000ms');
    } else {
      console.error('[API Protection] Auth validation error:', error);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
/**
 * Log security events for monitoring
 */
function logSecurityEvent(
  level: 'warn' | 'info',
  message: string,
  details: Record<string, unknown>
): void {
  const logData = {
    timestamp: new Date().toISOString(),
    ...details,
  };
  if (level === 'warn') {
    console.warn(`[API Protection] ${message}`, JSON.stringify(logData));
  } else {
    console.info(`[API Protection] ${message}`, JSON.stringify(logData));
  }
}
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event);
  const pathname = url.pathname;
  // Only apply protection to /api/* routes
  if (!pathname.startsWith('/api/')) {
    return;
  }
  const config = useRuntimeConfig(event);
  const isDevelopment = process.env.NODE_ENV === 'development';
  // Get API protection configuration
  const apiProtection = (config.apiProtection || {}) as ApiProtectionConfig;
  const allowedHosts = parseCommaSeparated(apiProtection.allowedHosts || '');
  const trustedIpRanges = parseCommaSeparated(apiProtection.trustedIpRanges || '');
  const requireAuth = apiProtection.requireAuth !== false; // Default to true
  const publicRoutes = parseCommaSeparated(apiProtection.publicRoutes || '');
  // Add default allowed hosts for production
  const effectiveAllowedHosts = [...allowedHosts];
  if (effectiveAllowedHosts.length === 0 && !isDevelopment) {
    // Default production hosts
    effectiveAllowedHosts.push('tarkovtracker.org', 'www.tarkovtracker.org');
  }
  // === SECURITY CHECK 1: Host Header Validation ===
  const hostHeader = getRequestHeader(event, 'host');
  if (!isHostAllowed(hostHeader, effectiveAllowedHosts, isDevelopment)) {
    logSecurityEvent('warn', 'Blocked request - invalid host', {
      pathname,
      host: hostHeader || 'none',
      allowedHosts: effectiveAllowedHosts,
    });
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'Access denied - invalid host',
    });
  }
  // === SECURITY CHECK 2: IP Validation (Optional) ===
  const clientIp = getClientIp(event, apiProtection.trustProxy);
  if (trustedIpRanges.length > 0 && !isIpTrusted(clientIp, trustedIpRanges)) {
    logSecurityEvent('warn', 'Blocked request - untrusted IP', {
      pathname,
      clientIp: clientIp || 'unknown',
      trustedRanges: trustedIpRanges,
    });
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'Access denied - untrusted source',
    });
  }
  // === SECURITY CHECK 3: Authentication (for non-public routes) ===
  const isPublic = isPublicRoute(pathname, publicRoutes);
  if (requireAuth && !isPublic) {
    const authHeader = getRequestHeader(event, 'authorization');
    const supabaseUrl = config.supabaseUrl as string;
    const supabaseAnonKey = config.supabaseAnonKey as string;
    const user = await validateAuthToken(authHeader, supabaseUrl, supabaseAnonKey);
    if (!user) {
      logSecurityEvent('warn', 'Blocked request - authentication required', {
        pathname,
        hasAuthHeader: !!authHeader,
        clientIp: clientIp || 'unknown',
      });
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
        message: 'Authentication required',
      });
    }
    // Attach user info to event context for downstream handlers
    event.context.auth = { user };
  }
  // === CORS Headers for legitimate requests ===
  const origin = getRequestHeader(event, 'origin');
  if (origin) {
    // Validate origin against allowed hosts
    try {
      const originUrl = new URL(origin);
      const originHost = originUrl.hostname;
      const isOriginAllowed =
        effectiveAllowedHosts.some((allowed) => {
          const allowedLower = allowed.toLowerCase();
          return originHost === allowedLower || originHost.endsWith('.' + allowedLower);
        }) ||
        (isDevelopment && (originHost === 'localhost' || originHost === '127.0.0.1'));
      if (isOriginAllowed) {
        setResponseHeader(event, 'Access-Control-Allow-Origin', origin);
        setResponseHeader(event, 'Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        setResponseHeader(event, 'Access-Control-Allow-Headers', 'Content-Type, Authorization');
        setResponseHeader(event, 'Access-Control-Allow-Credentials', 'true');
        setResponseHeader(event, 'Access-Control-Max-Age', 86400); // 24 hours
      }
    } catch {
      // Invalid origin URL - ignore CORS headers
    }
  }
  // Handle preflight OPTIONS requests
  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204);
    return '';
  }
});
