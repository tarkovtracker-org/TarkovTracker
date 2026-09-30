import { TARKOV_DATA_ACCESS_ACTION } from '@/server/utils/turnstile';
type TarkovAccessRuntimeConfig = {
  public?: {
    appUrl?: unknown;
    tarkovAccessEnabled?: unknown;
    tarkovAccessSiteKey?: unknown;
  };
  tarkovAccessExpectedHostnames?: unknown;
  tarkovAccessSecretKey?: unknown;
};
export type TarkovAccessServerConfig = {
  /**
   * Effective strict gate: the public flag AND the dedicated secret AND the browser sitekey
   * AND a non-empty exact hostname allowlist. Never widen this — the browser-clearance
   * handoff fails closed when any strict input is missing, and POST
   * /api/security/tarkov-verify answers 503 in that state.
   */
  enabled: boolean;
  /** The public flag as configured, regardless of strict completeness. */
  flagEnabled: boolean;
  siteKey: string;
  secretKey: string;
  /** Exact-match hostnames a minted token must report (no subdomain pinning). */
  expectedHostnames: string[];
  /** Widget action tokens must carry; server-side constant — never config-derived. */
  expectedAction: string;
};
const readTrimmedString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};
// The public flag supports the two shapes the browser transport accepts
// (boolean and the 'true' string, see resolveTarkovAccessSiteKey's client twin in
// app/utils/tarkovApiFetch.ts). Any other value means off.
const toBooleanFlag = (value: unknown): boolean => {
  return value === true || value === 'true';
};
const parseExactHostnameAllowlist = (raw: string): string[] => {
  return raw
    .split(',')
    .map((hostname) => hostname.trim().toLowerCase())
    .filter((hostname) => hostname.length > 0);
};
const hasRequiredStrictConfig = (
  siteKey: string,
  secretKey: string,
  expectedHostnames: string[]
): boolean => {
  return Boolean(siteKey) && Boolean(secretKey) && expectedHostnames.length > 0;
};
/**
 * Resolves the server-only Tarkov-data browser-clearance handoff config. Runtime config
 * keys (see nuxt.config.ts):
 * - public.tarkovAccessEnabled / public.tarkovAccessSiteKey (NUXT_PUBLIC_TARKOV_ACCESS_*)
 * - tarkovAccessSecretKey (NUXT_TARKOV_ACCESS_SECRET_KEY, Pages secret — never commit)
 * - tarkovAccessExpectedHostnames (NUXT_TARKOV_ACCESS_EXPECTED_HOSTNAMES, comma-separated
 *   exact allowlist; there is no request-host or APP_URL fallback)
 *
 * Every deployment is held to the same strict standard: the widget action is pinned to
 * TARKOV_DATA_ACCESS_ACTION and hostnames must be pinned to the exact configured
 * allowlist. Client-sitekey/secret pairs deliberately carry no exceptions — Cloudflare
 * widget identifiers are not special-cased from runtime-config; a deployment without the
 * exact hostname allowlist is simply not enabled.
 */
export const resolveTarkovAccessServerConfig = (
  config: TarkovAccessRuntimeConfig
): TarkovAccessServerConfig => {
  const secretKey = readTrimmedString(config.tarkovAccessSecretKey);
  const siteKey = readTrimmedString(config.public?.tarkovAccessSiteKey);
  const flagEnabled = toBooleanFlag(config.public?.tarkovAccessEnabled);
  const expectedHostnames = parseExactHostnameAllowlist(
    readTrimmedString(config.tarkovAccessExpectedHostnames)
  );
  const expectedAction = TARKOV_DATA_ACCESS_ACTION;
  return {
    enabled: flagEnabled && hasRequiredStrictConfig(siteKey, secretKey, expectedHostnames),
    expectedAction,
    expectedHostnames,
    flagEnabled,
    secretKey,
    siteKey,
  };
};
/** Shared positive-integer coercion for runtime-config limits (profile-get pattern). */
export const toPositiveInteger = (value: unknown, fallback: number): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const integer = Math.trunc(numeric);
  return integer > 0 ? integer : fallback;
};
