import {
  authenticateUser,
  createErrorResponse,
  createSuccessResponse,
  handleCorsPreflight,
  validateMethod,
} from '../_shared/auth.ts';
import {
  isDiscordNotInGuildError,
  removeAllTierRoles,
  removeLinkedAccountRole,
  removeSupporterRole,
} from '../_shared/discord.ts';

type DiscordAccountLink = {
  discord_user_id: string;
};

Deno.serve(async (req: Request) => {
  const cors = handleCorsPreflight(req);
  if (cors) return cors;

  const methodError = validateMethod(req, ['POST']);
  if (methodError) return methodError;

  const auth = await authenticateUser(req);
  if ('error' in auth) {
    return createErrorResponse(auth.error, auth.status, req);
  }

  const { data: link, error: linkError } = await auth.supabase
    .from('discord_account_links')
    .select('discord_user_id')
    .eq('user_id', auth.user.id)
    .maybeSingle<DiscordAccountLink>();
  if (linkError) {
    console.error('[discord-unlink] Discord account lookup failed:', linkError);
    return createErrorResponse('Unable to load linked Discord account', 502, req);
  }
  if (!link) {
    return createSuccessResponse({ revoked: false, reason: 'not_linked' }, 200, req);
  }

  try {
    await removeAllTierRoles(link.discord_user_id);
    await removeSupporterRole(link.discord_user_id);
    await removeLinkedAccountRole(link.discord_user_id);
  } catch (error) {
    if (isDiscordNotInGuildError(error)) {
      return createSuccessResponse({ revoked: false, reason: 'not_in_guild' }, 200, req);
    }
    console.error('[discord-unlink] Failed to revoke managed Discord roles:', error);
    return createErrorResponse('Unable to revoke managed Discord roles', 502, req);
  }

  return createSuccessResponse({ revoked: true }, 200, req);
});
