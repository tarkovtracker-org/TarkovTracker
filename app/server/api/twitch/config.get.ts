import { defineEventHandler, setResponseHeaders } from 'h3';
import { useRuntimeConfig } from '#imports';
import { adminSupabaseFetch, normalizeSupabaseUrl } from '@/server/utils/adminSupabase';
import { createLogger } from '@/server/utils/logger';
const logger = createLogger('twitch-config');
const CACHE_TAG = 'promoted-twitch-config';
const EDGE_CACHE_TTL_SECONDS = 3_600;
const CACHE_HEADERS = {
  'cache-control': `public, max-age=300, s-maxage=${EDGE_CACHE_TTL_SECONDS}`,
  'cloudflare-cdn-cache-control': `public, max-age=${EDGE_CACHE_TTL_SECONDS}`,
  'cache-tag': CACHE_TAG,
  vary: 'Origin',
};
const NO_STORE_HEADERS = { 'cache-control': 'no-store' };
const SETTING_KEY = 'promoted_twitch';
const DEFAULT_CHANNEL = 'honeyxxo';
const CHANNEL_REGEX = /^[a-z0-9_]{1,25}$/;
const DISPLAY_NAME_MAX_LENGTH = 50;
interface TwitchConfig {
  channel: string;
  displayName: string;
  enabled: boolean;
  version: number;
}
interface TwitchFallback {
  channel?: string;
  displayName?: string;
  enabled?: boolean;
}
interface SettingRow {
  value?: Record<string, unknown>;
  version?: number;
}
interface OverrideResult {
  value?: Record<string, unknown>;
  version?: number;
  failed?: boolean;
}
function normalizeChannel(value: unknown): string {
  if (typeof value !== 'string') return '';
  const channel = value.trim().toLowerCase();
  return CHANNEL_REGEX.test(channel) ? channel : '';
}
function readTrimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}
function displayNameOr(value: unknown, fallback: string): string {
  const displayName = readTrimmed(value);
  if (!displayName || displayName.length > DISPLAY_NAME_MAX_LENGTH) return fallback;
  return displayName;
}
function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
function resolveConfig(
  fallback: TwitchFallback,
  override?: Record<string, unknown>
): Omit<TwitchConfig, 'version'> {
  const channel = normalizeChannel(fallback.channel) || DEFAULT_CHANNEL;
  const base = {
    channel,
    displayName: displayNameOr(fallback.displayName, channel),
    enabled: boolOr(fallback.enabled, false),
  };
  if (!override) return base;
  return {
    channel: normalizeChannel(override.channel) || base.channel,
    displayName: displayNameOr(override.displayName, base.displayName),
    enabled: boolOr(override.enabled, base.enabled),
  };
}
function readSupabaseUrl(runtime: Record<string, unknown>): string {
  return normalizeSupabaseUrl(runtime.supabaseUrl);
}
function readServiceKey(runtime: Record<string, unknown>): string {
  const value = runtime.supabaseServiceKey;
  return typeof value === 'string' ? value : '';
}
async function readOverride(runtime: Record<string, unknown>): Promise<OverrideResult> {
  const supabaseUrl = readSupabaseUrl(runtime);
  const serviceKey = readServiceKey(runtime);
  if (!supabaseUrl || !serviceKey) return { failed: true };
  return fetchSetting(supabaseUrl, serviceKey);
}
async function fetchSetting(supabaseUrl: string, serviceKey: string): Promise<OverrideResult> {
  try {
    const rows = await adminSupabaseFetch<SettingRow[]>(
      supabaseUrl,
      serviceKey,
      `/rest/v1/app_settings?select=value,version&key=eq.${SETTING_KEY}&limit=1`
    );
    return { value: rows?.[0]?.value, version: rows?.[0]?.version };
  } catch (err) {
    logger.warn('Failed to read Twitch config override, falling back to env defaults', err);
    return { failed: true };
  }
}
function readFallback(runtime: Record<string, unknown>): TwitchFallback {
  const publicConfig = runtime.public as { promotedTwitch?: TwitchFallback } | undefined;
  return publicConfig?.promotedTwitch ?? {};
}
export default defineEventHandler(async (event): Promise<TwitchConfig> => {
  const runtime = useRuntimeConfig(event) as Record<string, unknown>;
  const fallback = readFallback(runtime);
  const override = await readOverride(runtime);
  const config = resolveConfig(fallback, override.value);
  setResponseHeaders(event, override.failed ? NO_STORE_HEADERS : CACHE_HEADERS);
  return {
    ...config,
    version: Number.isSafeInteger(override.version) ? (override.version as number) : 0,
  };
});
