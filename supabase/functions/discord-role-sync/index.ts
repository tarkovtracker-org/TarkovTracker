import { createErrorResponse, createSuccessResponse } from '../_shared/auth.ts';
import { authenticateMutation } from '../_shared/authenticated-mutation.ts';
import {
  isDiscordNotInGuildError,
  removeAllTierRoles,
  removeSupporterRole,
  syncLinkedAccountRole,
  syncRolesForSupporter,
} from '../_shared/discord.ts';
type DiscordAccountLink = {
  discord_user_id: string;
};
type Supporter = {
  expires_at: string | null;
  has_ever_supported: boolean;
  status: 'active' | 'past_due' | 'expired' | 'cancelled';
  tier: 'supporter' | 'scav' | 'timmy' | 'chad';
};
function isActive(supporter: Supporter | null): boolean {
  if (!supporter) return false;
  if (supporter.status === 'active' && !supporter.expires_at) return true;
  if (!['active', 'past_due'].includes(supporter.status) || !supporter.expires_at) return false;
  const expiresAt = Date.parse(supporter.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}
function activeTier(supporter: Supporter | null): Supporter['tier'] | null {
  return supporter && isActive(supporter) ? supporter.tier : null;
}
Deno.serve(async (req: Request) => {
  const auth = await authenticateMutation(req, 'discord-role-sync');
  if (auth.response) return auth.response;
  const { data: link, error: linkError } = await auth.supabase
    .from('discord_account_links')
    .select('discord_user_id')
    .eq('user_id', auth.user.id)
    .maybeSingle<DiscordAccountLink>();
  if (linkError) {
    console.error('[discord-role-sync] Discord account lookup failed:', linkError);
    return createErrorResponse('Unable to load linked Discord account', 502, req);
  }
  if (!link) {
    return createErrorResponse('No Discord account is linked to this user', 404, req);
  }
  try {
    await syncLinkedAccountRole(link.discord_user_id);
    const { data: supporter, error: supporterError } = await auth.supabase
      .from('supporter_entitlements')
      .select('tier, status, expires_at, has_ever_supported')
      .eq('user_id', auth.user.id)
      .maybeSingle<Supporter>();
    if (supporterError) {
      console.error('[discord-role-sync] Supporter lookup failed:', supporterError);
      return createErrorResponse('Unable to load supporter status', 502, req);
    }
    const tier = activeTier(supporter);
    if (tier) {
      await syncRolesForSupporter(link.discord_user_id, tier, true);
    } else {
      await removeAllTierRoles(link.discord_user_id);
      if (supporter?.has_ever_supported) {
        await syncRolesForSupporter(link.discord_user_id, 'supporter', true);
      } else {
        await removeSupporterRole(link.discord_user_id);
      }
    }
  } catch (error) {
    if (isDiscordNotInGuildError(error)) {
      return createSuccessResponse({ synced: false, reason: 'not_in_guild' }, 200, req);
    }
    console.error('[discord-role-sync] Discord role synchronization failed:', error);
    return createErrorResponse('Unable to synchronize Discord roles', 502, req);
  }
  return createSuccessResponse({ synced: true }, 200, req);
});
