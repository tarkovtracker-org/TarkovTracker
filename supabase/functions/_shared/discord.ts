/**
 * Discord role sync utility for Supabase Edge Functions.
 * Adds/removes Discord roles via the Bot API.
 */

const DISCORD_API_BASE = 'https://discord.com/api/v10';

interface RoleAction {
  guildId: string;
  userId: string;
  roleId: string;
}

function getDiscordHeaders(): Record<string, string> {
  const token = Deno.env.get('DISCORD_BOT_TOKEN');
  if (!token) {
    throw new Error('Missing DISCORD_BOT_TOKEN env');
  }
  return {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function addRole({ guildId, userId, roleId }: RoleAction): Promise<boolean> {
  const url = `${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}/roles/${roleId}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: getDiscordHeaders(),
  });
  if (res.status === 204 || res.status === 200) return true;
  console.error(`[Discord] Failed to add role ${roleId} to user ${userId}: ${res.status}`);
  return false;
}

export async function removeRole({ guildId, userId, roleId }: RoleAction): Promise<boolean> {
  const url = `${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}/roles/${roleId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: getDiscordHeaders(),
  });
  if (res.status === 204 || res.status === 200) return true;
  console.error(`[Discord] Failed to remove role ${roleId} from user ${userId}: ${res.status}`);
  return false;
}

export interface DiscordRoleConfig {
  guildId: string;
  supporterRoleId: string;
  scavRoleId: string;
  timmyRoleId: string;
  chadRoleId: string;
}

export function getDiscordRoleConfig(): DiscordRoleConfig {
  const guildId = Deno.env.get('DISCORD_GUILD_ID');
  const supporterRoleId = Deno.env.get('DISCORD_SUPPORTER_ROLE_ID');
  const missing: string[] = [];
  if (!guildId) missing.push('DISCORD_GUILD_ID');
  if (!supporterRoleId) missing.push('DISCORD_SUPPORTER_ROLE_ID');
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  return {
    guildId: guildId as string,
    supporterRoleId: supporterRoleId as string,
    scavRoleId: Deno.env.get('DISCORD_SCAV_ROLE_ID') || '',
    timmyRoleId: Deno.env.get('DISCORD_TIMMY_ROLE_ID') || '',
    chadRoleId: Deno.env.get('DISCORD_CHAD_ROLE_ID') || '',
  };
}

export function getTierRoleId(
  tier: string,
  config: DiscordRoleConfig
): string | null {
  switch (tier) {
    case 'scav':
      return config.scavRoleId || null;
    case 'timmy':
      return config.timmyRoleId || null;
    case 'chad':
      return config.chadRoleId || null;
    default:
      return null;
  }
}

/**
 * Sync Discord roles for a supporter.
 * Always adds the base Supporter role.
 * Adds the tier-specific role if applicable.
 */
export async function syncRolesForSupporter(
  discordUserId: string,
  tier: string,
  active: boolean
): Promise<void> {
  if (!discordUserId) return;
  const config = getDiscordRoleConfig();
  if (!config.guildId) return;

  // Always keep the base Supporter role (permanent once earned)
  await addRole({
    guildId: config.guildId,
    userId: discordUserId,
    roleId: config.supporterRoleId,
  });

  const tierRoleId = getTierRoleId(tier, config);
  if (!tierRoleId) return;

  if (active) {
    await addRole({ guildId: config.guildId, userId: discordUserId, roleId: tierRoleId });
  } else {
    await removeRole({ guildId: config.guildId, userId: discordUserId, roleId: tierRoleId });
  }
}

/**
 * Remove all tier roles (but keep Supporter) when a subscription expires.
 */
export async function removeAllTierRoles(discordUserId: string): Promise<void> {
  if (!discordUserId) return;
  const config = getDiscordRoleConfig();
  if (!config.guildId) return;

  const tierRoles = [config.scavRoleId, config.timmyRoleId, config.chadRoleId].filter(Boolean);
  for (const roleId of tierRoles) {
    await removeRole({ guildId: config.guildId, userId: discordUserId, roleId });
  }
}
