/**
 * Discord role sync utility for Supabase Edge Functions.
 * Adds/removes Discord roles via the Bot API.
 */

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RATE_LIMIT_WAIT_MS = 10_000;
export const DISCORD_REQUEST_TIMEOUT_MS = 12_000;
const UNKNOWN_MEMBER_CODE = 10007;
const UNKNOWN_USER_CODE = 10013;

export type DiscordRoleStatus = 'failed' | 'not_in_guild' | 'success';

export class DiscordNotInGuildError extends Error {
  constructor(userId: string) {
    super(`Discord user ${userId} is not in the configured guild`);
    this.name = 'DiscordNotInGuildError';
  }
}

export function isDiscordNotInGuildError(error: unknown): error is DiscordNotInGuildError {
  return (
    error instanceof DiscordNotInGuildError ||
    (error instanceof Error && error.name === 'DiscordNotInGuildError')
  );
}

export function classifyDiscordRoleStatus(
  status: number,
  errorCode: number | null = null
): DiscordRoleStatus {
  if (status === 200 || status === 204) return 'success';
  if (status === 404 && (errorCode === UNKNOWN_MEMBER_CODE || errorCode === UNKNOWN_USER_CODE)) {
    return 'not_in_guild';
  }
  return 'failed';
}

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

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw new DOMException('The operation was aborted.', 'AbortError');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
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
 * responses for up to MAX_RATE_LIMIT_RETRIES attempts. Bounded by a total
 * wall-clock deadline so stalled connections cannot hang Edge Functions.
 * Does not retry other statuses; callers handle their own non-2xx logic.
 */
async function discordFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DISCORD_REQUEST_TIMEOUT_MS);
  const parentSignal = init.signal;

  const onParentAbort = () => controller.abort();
  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener('abort', onParentAbort);
  }

  try {
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
      throwIfAborted(controller.signal);

      const res = await fetch(url, { ...init, signal: controller.signal });
      if (res.status !== 429) return res;

      const retryAfter = parseRetryAfterSecs(res.headers.get('retry-after'));
      const waitMs = Math.min(Math.max(retryAfter * 1000, 250), MAX_RATE_LIMIT_WAIT_MS);
      if (attempt === MAX_RATE_LIMIT_RETRIES) return res;

      console.warn(
        `[Discord] 429 on ${url}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})`
      );
      await sleep(waitMs, controller.signal);
    }

    // Unreachable but keeps TS happy
    throwIfAborted(controller.signal);
    return fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`Discord request timed out after ${DISCORD_REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}

async function applyRole(
  method: 'PUT' | 'DELETE',
  { guildId, userId, roleId }: RoleAction
): Promise<boolean> {
  const url = `${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}/roles/${roleId}`;
  const res = await discordFetch(url, { method, headers: getDiscordHeaders() });
  let errorCode: number | null = null;
  try {
    const body = (await res.json()) as { code?: unknown };
    errorCode = typeof body.code === 'number' ? body.code : null;
  } catch {
    errorCode = null;
  }
  const status = classifyDiscordRoleStatus(res.status, errorCode);
  if (status === 'success') return true;
  if (status === 'not_in_guild') throw new DiscordNotInGuildError(userId);
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
  linkedRoleId: string;
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
    linkedRoleId: Deno.env.get('DISCORD_LINKED_ROLE_ID') || '',
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

  const supporterRoleAdded = await addRole({
    guildId: config.guildId,
    userId: discordUserId,
    roleId: config.supporterRoleId,
  });
  if (!supporterRoleAdded) {
    throw new Error(`Unable to add supporter role for Discord user ${discordUserId}`);
  }

  const tierRoleId = getTierRoleId(tier, config);
  if (active) {
    const allTierRoles = [config.scavRoleId, config.timmyRoleId, config.chadRoleId].filter(Boolean);
    const staleRoles = allTierRoles.filter((id) => id !== tierRoleId);
    const staleRoleResults = await Promise.all(
      staleRoles.map((roleId) =>
        removeRole({ guildId: config.guildId, userId: discordUserId, roleId })
      )
    );
    const tierRoleAdded = tierRoleId
      ? await addRole({
          guildId: config.guildId,
          userId: discordUserId,
          roleId: tierRoleId,
        })
      : true;
    if (staleRoleResults.some((result) => !result) || !tierRoleAdded) {
      throw new Error(`Unable to synchronize tier roles for Discord user ${discordUserId}`);
    }
  } else if (tierRoleId) {
    const tierRoleRemoved = await removeRole({
      guildId: config.guildId,
      userId: discordUserId,
      roleId: tierRoleId,
    });
    if (!tierRoleRemoved) {
      throw new Error(`Unable to remove tier role for Discord user ${discordUserId}`);
    }
  }
}

export async function syncLinkedAccountRole(discordUserId: string): Promise<void> {
  if (!discordUserId) return;
  const config = getDiscordRoleConfig();
  if (!config.linkedRoleId) {
    throw new Error('Missing DISCORD_LINKED_ROLE_ID env');
  }
  const linkedRoleAdded = await addRole({
    guildId: config.guildId,
    userId: discordUserId,
    roleId: config.linkedRoleId,
  });
  if (!linkedRoleAdded) {
    throw new Error(`Unable to add linked role for Discord user ${discordUserId}`);
  }
}

export async function removeLinkedAccountRole(discordUserId: string): Promise<void> {
  if (!discordUserId) return;
  const config = getDiscordRoleConfig();
  if (!config.linkedRoleId) {
    throw new Error('Missing DISCORD_LINKED_ROLE_ID env');
  }
  const removed = await removeRole({
    guildId: config.guildId,
    userId: discordUserId,
    roleId: config.linkedRoleId,
  });
  if (!removed) {
    throw new Error(`Unable to remove linked role for Discord user ${discordUserId}`);
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
  const results = await Promise.all(
    tierRoles.map((roleId) =>
      removeRole({ guildId: config.guildId, userId: discordUserId, roleId })
    )
  );
  if (results.some((result) => !result)) {
    throw new Error(`Unable to remove tier roles for Discord user ${discordUserId}`);
  }
}

export async function removeSupporterRole(discordUserId: string): Promise<void> {
  if (!discordUserId) return;
  const config = getDiscordRoleConfig();
  const removed = await removeRole({
    guildId: config.guildId,
    userId: discordUserId,
    roleId: config.supporterRoleId,
  });
  if (!removed) {
    throw new Error(`Unable to remove supporter role for Discord user ${discordUserId}`);
  }
}
