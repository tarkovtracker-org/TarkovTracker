import { logger } from '@/utils/logger';
import { hydrateUserFromSession, type HydratableUser } from '@/utils/userHydration';
type SupabaseGuardContext = {
  ready: () => Promise<void>;
  user: HydratableUser;
};
export async function ensureSupabaseReadyForRoute(
  supabase: SupabaseGuardContext,
  routeName: string
): Promise<boolean> {
  try {
    await supabase.ready();
    return true;
  } catch (error) {
    hydrateUserFromSession(supabase.user, null);
    logger.error(`${routeName}: Supabase bootstrap failed`, error);
    return false;
  }
}
