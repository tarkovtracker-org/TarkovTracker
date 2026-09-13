import { ProviderFailure } from './provider-http.ts';
export type DiscordCleanupConfig = {
  guildId: string;
  /** Only roles managed by this application: linked, supporter, and configured tiers. */
  managedRoleIds: readonly string[];
  token: string;
};
function payloadRetry(body: unknown): number {
  if (!body || typeof body !== 'object') return 0;
  return 'retry_after' in body ? Number(body.retry_after) : 0;
}
const retrySeconds = (response: Response, body: unknown): number => {
  const header = Number(response.headers.get('retry-after'));
  return Math.min(86400, Math.max(1, header || payloadRetry(body) || 60));
};
function discordCode(body: unknown): unknown {
  if (!body || typeof body !== 'object') return null;
  return 'code' in body ? body.code : null;
}
function expectedAbsence(response: Response, body: unknown, method: 'DELETE' | 'PUT'): boolean {
  if (response.status !== 404) return false;
  if (discordCode(body) === 10007) return true;
  return discordCode(body) === 10011 && method === 'DELETE';
}
async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ProviderFailure(
      'discord_invalid_response',
      response.ok || response.status === 429 || response.status >= 500
    );
  }
}
async function checkRemoval(response: Response, method: 'DELETE' | 'PUT'): Promise<void> {
  if (response.status === 204) return;
  const body = await responseBody(response);
  // A missing guild, invalid token, permission failure, or unknown route is not proof of removal.
  if (expectedAbsence(response, body, method)) return;
  throw new ProviderFailure(
    `discord_http_${response.status}`,
    response.status === 429 || response.status >= 500,
    retrySeconds(response, body)
  );
}
/** Explicitly constructed adapter. Importing this module makes no network requests. */
export function discordRoleCleanup(
  config: DiscordCleanupConfig,
  fetcher: typeof fetch,
  method: 'DELETE' | 'PUT' = 'DELETE'
) {
  validateConfiguration(config);
  const roles = [...new Set(config.managedRoleIds)];
  if (roles.some((role) => !role)) throw new ProviderFailure('discord_cleanup_role_missing', false);
  return async (userId: string): Promise<void> => {
    if (!userId) throw new ProviderFailure('missing_identifier', false);
    for (const role of roles) {
      let response: Response;
      try {
        response = await fetcher(
          `https://discord.com/api/v10/guilds/${encodeURIComponent(config.guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(role)}`,
          {
            method,
            headers: { Authorization: `Bot ${config.token}` },
            signal: AbortSignal.timeout(10000),
          }
        );
      } catch {
        throw new ProviderFailure('discord_transport', true);
      }
      await checkRemoval(response, method);
    }
  };
}
function validateConfiguration(config: DiscordCleanupConfig) {
  if (!config.guildId || !config.token || config.managedRoleIds.length === 0) {
    throw new ProviderFailure('discord_cleanup_configuration_missing', false);
  }
}
