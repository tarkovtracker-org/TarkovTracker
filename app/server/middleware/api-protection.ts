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
} from 'h3';
import ipaddr from 'ipaddr.js';
import { useRuntimeConfig } from '#imports';
import { createLogger } from '@/server/utils/logger';
import { getClientAddress } from '@/server/utils/requestIdentity';
import type { H3Event } from 'h3';
const logger = createLogger('ApiProtection');
interface ApiProtectionSettings {
  allowedHosts?: string;
  trustedIpRanges?: string;
  requireAuth?: boolean;
  publicRoutes?: string;
  trustProxy?: boolean;
}
export interface ApiProtectionConfig {
  apiProtection?: ApiProtectionSettings;
  public?: {
    appUrl?: string;
  };
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
    const parts = range.split('/');
    if (parts.length > 2) {
      return false;
    }
    const rangeIp = parts[0];
    const cidrStr = parts[1];
    if (!rangeIp) {
      return false;
    }
    if (!cidrStr) {
      const rangeAddr = ipaddr.process(rangeIp);
      return addr.toString() === rangeAddr.toString();
    }
    if (!/^\d+$/.test(cidrStr)) {
      return false;
    }
    const rangeAddr = ipaddr.parse(rangeIp);
    const cidr = parseInt(cidrStr, 10);
    const maxPrefix = rangeAddr.kind() === 'ipv4' ? 32 : 128;
    if (cidr < 0 || cidr > maxPrefix) {
      return false;
    }
    if (addr.kind() !== rangeAddr.kind()) {
      return false;
    }
    if (addr.kind() === 'ipv4') {
      return (addr as ipaddr.IPv4).match(rangeAddr as ipaddr.IPv4, cidr);
    }
    return (addr as ipaddr.IPv6).match(rangeAddr as ipaddr.IPv6, cidr);
  } catch (err) {
    logger.error('Failed to parse IP', { err, clientIp, range });
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
  const host = (hostHeader.split(':')[0] ?? '').toLowerCase();
  return allowedHosts.some((allowed) => {
    const allowedLower = allowed.toLowerCase();
    // Exact match or subdomain match (e.g., "tarkovtracker.org" matches "www.tarkovtracker.org")
    return host === allowedLower || host.endsWith('.' + allowedLower);
  });
}
function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '::1' || hostname.startsWith('127.');
}
function resolveAppUrlHosts(appUrl: string | undefined, isDevelopment: boolean): string[] {
  if (!appUrl || appUrl.trim().length === 0) {
    return [];
  }
  try {
    const hostname = new URL(appUrl).hostname.toLowerCase();
    const hosts = [hostname];
    if (hostname.endsWith('.pages.dev')) {
      const hostnameParts = hostname.split('.');
      if (hostnameParts.length > 3) {
        hosts.push(hostnameParts.slice(1).join('.'));
      }
    }
    const uniqueHosts = [...new Set(hosts)];
    if (isDevelopment) {
      return uniqueHosts;
    }
    return uniqueHosts.filter((host) => !isLoopbackHost(host));
  } catch {
    return [];
  }
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
    logger.error('Supabase configuration missing for auth validation');
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
      logger.warn('Auth validation failed', { status: response.status });
      return null;
    }
    const user = (await response.json()) as { id: string };
    return user?.id ? user : null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn('Auth validation timed out after 5000ms');
    } else {
      logger.error('Auth validation error', { error });
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
    logger.warn(message, logData);
  } else {
    logger.info(message, logData);
  }
}
function applyCorsHeaders(
  event: H3Event,
  effectiveAllowedHosts: string[],
  isDevelopment: boolean,
  pathname: string,
  clientIp: string | null
): void {
  const origin = getRequestHeader(event, 'origin');
  if (!origin) {
    return;
  }
  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.hostname;
    const isOriginAllowed =
      effectiveAllowedHosts.some((allowed) => {
        const allowedLower = allowed.toLowerCase();
        return originHost === allowedLower || originHost.endsWith('.' + allowedLower);
      }) ||
      (isDevelopment && (originHost === 'localhost' || originHost === '127.0.0.1'));
    if (!isOriginAllowed) {
      return;
    }
    setResponseHeader(event, 'Access-Control-Allow-Origin', origin);
    setResponseHeader(event, 'Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    setResponseHeader(event, 'Access-Control-Allow-Headers', 'Content-Type, Authorization');
    setResponseHeader(event, 'Access-Control-Allow-Credentials', 'true');
    setResponseHeader(event, 'Access-Control-Max-Age', 86400);
  } catch (error) {
    logSecurityEvent('warn', 'Invalid CORS origin header', {
      pathname,
      origin,
      clientIp: clientIp || 'unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
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
  const typedConfig = config as ApiProtectionConfig;
  const isDevelopment = process.env.NODE_ENV === 'development';
  // Get API protection configuration
  const apiProtection: ApiProtectionSettings = typedConfig.apiProtection || {};
  const allowedHosts = parseCommaSeparated(apiProtection.allowedHosts || '');
  const trustedIpRanges = parseCommaSeparated(apiProtection.trustedIpRanges || '');
  const requireAuth = apiProtection.requireAuth !== false; // Default to true
  const defaultPublicRoutes = [
    '/api/tarkov/*',
    '/api/changelog',
    '/api/contributors',
    '/api/profile/*',
    '/api/streamer/*',
  ];
  const configuredPublicRoutesRaw = apiProtection.publicRoutes?.trim();
  const publicRoutes =
    configuredPublicRoutesRaw && configuredPublicRoutesRaw.length > 0
      ? parseCommaSeparated(configuredPublicRoutesRaw)
      : defaultPublicRoutes;
  // Add default allowed hosts for production
  const effectiveAllowedHosts = [...allowedHosts];
  if (allowedHosts.length === 0 && !isDevelopment) {
    // Default production hosts
    effectiveAllowedHosts.push('tarkovtracker.org', 'www.tarkovtracker.org');
  }
  effectiveAllowedHosts.push(...resolveAppUrlHosts(typedConfig.public?.appUrl, isDevelopment));
  const uniqueAllowedHosts = [...new Set(effectiveAllowedHosts.map((host) => host.toLowerCase()))];
  // === SECURITY CHECK 1: Host Header Validation ===
  const hostHeader = getRequestHeader(event, 'host');
  if (!isHostAllowed(hostHeader, uniqueAllowedHosts, isDevelopment)) {
    logSecurityEvent('warn', 'Blocked request - invalid host', {
      pathname,
      host: hostHeader || 'none',
      allowedHosts: uniqueAllowedHosts,
    });
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'Access denied - invalid host',
    });
  }
  // === SECURITY CHECK 2: IP Validation (Optional) ===
  const clientIp = getClientAddress(event, apiProtection.trustProxy);
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
  applyCorsHeaders(event, uniqueAllowedHosts, isDevelopment, pathname, clientIp);
  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204);
    return '';
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
});
