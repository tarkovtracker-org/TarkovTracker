import {
  extractUserMetadataDisplayName,
  extractUserMetadataUsername,
  getUserMetadataString,
} from '@shared/utils/userMetadata';
import { logger } from '@/utils/logger';
import { getMemoryCache, setMemoryCache } from '@/utils/memory-cache';
import type { Env } from '@/types';
const DISPLAY_NAME_CACHE_TTL_SECONDS = 86400;
const metadataRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
const resolveDisplayName = (data: Record<string, unknown>): string | null => {
  const metadata = metadataRecord(data.user_metadata);
  const provider = getUserMetadataString(metadataRecord(data.app_metadata), 'provider');
  const email = getUserMetadataString(data, 'email');
  const username = extractUserMetadataUsername(metadata, email, provider);
  return extractUserMetadataDisplayName(metadata, provider, username);
};
const fetchDisplayName = async (env: Env, userId: string): Promise<string | null> => {
  try {
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) return null;
    return resolveDisplayName(metadataRecord(await response.json()));
  } catch (error) {
    logger.error('[getUserDisplayName] Failed to resolve display name:', error);
    return null;
  }
};
export const getUserDisplayName = async (env: Env, userId: string): Promise<string | null> => {
  const cacheKey = `user-display:${userId}`;
  const cached = getMemoryCache<string>(cacheKey);
  if (cached) return cached;
  const displayName = await fetchDisplayName(env, userId);
  if (displayName) setMemoryCache(cacheKey, displayName, DISPLAY_NAME_CACHE_TTL_SECONDS);
  return displayName;
};
