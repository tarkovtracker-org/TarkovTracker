import type { UserScopedStorageEnvelope } from '@/utils/storage/envelope';
export {
  parseUserScopedStorage,
  recoveryRawOwner,
  isOwnedProgressRecovery,
} from '@/utils/storage/envelope';
export const getCurrentSupabaseUserId = (): string | null => {
  try {
    const nuxtApp = useNuxtApp();
    return nuxtApp.$supabase?.user?.id || null;
  } catch {
    return null;
  }
};
export const serializeUserScopedStorage = <T>(
  data: T,
  userId: string | null = getCurrentSupabaseUserId(),
  timestamp: number = Date.now()
): string => {
  return JSON.stringify({
    _timestamp: timestamp,
    _userId: userId,
    data,
  } satisfies UserScopedStorageEnvelope<T>);
};
