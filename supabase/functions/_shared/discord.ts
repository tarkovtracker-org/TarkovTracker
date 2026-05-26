/**
 * Discord role sync utility for Supabase Edge Functions.
 * Adds/removes Discord roles via the Bot API.
 */

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RATE_LIMIT_WAIT_MS = 10_000;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterSecs(header: string | null): number {
  if (!header) return 1;
  const secs = parseInt(header, 10);
  if (!Number.isNaN(secs)) return Math.max(1, secs);
  const dateMs = Date.parse(header);
  return Number.isNaN(dateMs) ? 1 : Math.max(1, (dateMs - Date.now()) / 1000);
}

/**
 * Discord rate-limit aware fetch. Honours the `Retry-After` header on 429
 * responses for up to MAX_RATE_LIMIT_RETRIES attempts. Does not retry other
 * statuses; callers handle their own non-2xx logic.
 */
async function discordFetch(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    const retryAfter = parseRetryAfterSecs(res.headers.get('retry-after'));
    const waitMs = Math.min(
      Math.max(retryAfter * 1000, 250),
      MAX_RATE_LIMIT_WAIT_MS
    );
    if (attempt === MAX_RATE_LIMIT_RETRIES) return res;
    console.warn(
      `[Discord] 429 on ${url}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})`
    );
    await sleep(waitMs);
  }
  // Unreachable but keeps TS happy
  return fetch(url, init);
}

async function applyRole(
  method: 'PUT' | 'DELETE',
  { guildId, userId, roleId }: RoleAction
): Promise<boolean> {
  const url = `${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}/roles/${roleId}`;
  const res = await discordFetch(url, { method, headers: getDiscordHeaders() });
  if (res.status === 204 || res.status === 200) return true;
  const verb = method === 'PUT' ? 'add' : 'remove';
  console.error(`[Discord] Failed to ${verb} role ${roleId} for user ${userId}: ${res.status}`);
  return false;
}

export function addRole(action: RoleAction): Promise<boolean> {
  return applyRole('PUT', action);
}

export function removeRole(action: RoleAction): Promise<boolean> {
  return applyRole('DELETE', action);
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

export function getTierRoleId(tier: string, config: DiscordRoleConfig): string | null {
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
 * Adds the tier-specific role and removes stale tier roles.
 */
export async function syncRolesForSupporter(
  discordUserId: string,
  tier: string,
  active: boolean
): Promise<void> {
  if (!discordUserId) return;
  const config = getDiscordRoleConfig();

  await addRole({
    guildId: config.guildId,
    userId: discordUserId,
    roleId: config.supporterRoleId,
  });

  const tierRoleId = getTierRoleId(tier, config);
  if (!tierRoleId) return;

  if (active) {
    const allTierRoles = [config.scavRoleId, config.timmyRoleId, config.chadRoleId].filter(Boolean);
    const staleRoles = allTierRoles.filter((id) => id !== tierRoleId);
    await Promise.all(
      staleRoles.map((roleId) =>
        removeRole({ guildId: config.guildId, userId: discordUserId, roleId })
      )
    );
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

  const tierRoles = [config.scavRoleId, config.timmyRoleId, config.chadRoleId].filter(Boolean);
  if (tierRoles.length === 0) return;
  await Promise.all(
    tierRoles.map((roleId) =>
      removeRole({ guildId: config.guildId, userId: discordUserId, roleId })
    )
  );
}
