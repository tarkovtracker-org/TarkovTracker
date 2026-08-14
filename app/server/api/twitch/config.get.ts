import { defineEventHandler, setResponseHeaders } from 'h3';
import { useRuntimeConfig } from '#imports';
import { adminSupabaseFetch, normalizeSupabaseUrl } from '@/server/utils/adminSupabase';
import { createLogger } from '@/server/utils/logger';
const logger = createLogger('twitch-config');
const CACHE_TTL_MS = 30_000;
const LIVE_HEADERS = { 'cache-control': 'public, max-age=15, s-maxage=30' };
const SETTING_KEY = 'promoted_twitch';
const DEFAULT_CHANNEL = 'honeyxxo';
const CHANNEL_REGEX = /^[a-z0-9_]{1,25}$/;
const DISPLAY_NAME_MAX_LENGTH = 50;
interface TwitchConfig {
  channel: string;
  displayName: string;
  enabled: boolean;
}
interface TwitchFallback {
  channel?: string;
  displayName?: string;
  enabled?: boolean;
}
interface SettingRow {
  value?: Record<string, unknown>;
}
interface OverrideResult {
  ok: boolean;
  value?: Record<string, unknown>;
}
let cached: { config: TwitchConfig; fetchedAt: number } | null = null;
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
function resolveConfig(fallback: TwitchFallback, override?: Record<string, unknown>): TwitchConfig {
  const channel = normalizeChannel(fallback.channel) || DEFAULT_CHANNEL;
  const base: TwitchConfig = {
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
function readCached(): TwitchConfig | null {
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt >= CACHE_TTL_MS) return null;
  return cached.config;
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
  if (!supabaseUrl || !serviceKey) return { ok: true };
  return fetchSetting(supabaseUrl, serviceKey);
}
async function fetchSetting(supabaseUrl: string, serviceKey: string): Promise<OverrideResult> {
  try {
    const rows = await adminSupabaseFetch<SettingRow[]>(
      supabaseUrl,
      serviceKey,
      `/rest/v1/app_settings?select=value&key=eq.${SETTING_KEY}&limit=1`
    );
    return { ok: true, value: rows?.[0]?.value };
  } catch (err) {
    logger.warn('Failed to read Twitch config override, falling back to env defaults', err);
    return { ok: false };
  }
}
function readFallback(runtime: Record<string, unknown>): TwitchFallback {
  const publicConfig = runtime.public as { promotedTwitch?: TwitchFallback } | undefined;
  return publicConfig?.promotedTwitch ?? {};
}
export default defineEventHandler(async (event) => {
  const runtime = useRuntimeConfig(event) as Record<string, unknown>;
  const fallback = readFallback(runtime);
  const cachedConfig = readCached();
  if (cachedConfig) {
    setResponseHeaders(event, LIVE_HEADERS);
    return cachedConfig;
  }
  const override = await readOverride(runtime);
  const config = resolveConfig(fallback, override.value);
  if (override.ok) cached = { config, fetchedAt: Date.now() };
  setResponseHeaders(event, LIVE_HEADERS);
  return config;
});
