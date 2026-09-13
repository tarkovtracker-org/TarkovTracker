import { discordRoleCleanup, type DiscordCleanupConfig } from './discord-lifecycle.ts';
import { ProviderFailure } from './provider-http.ts';
import type { LifecycleWork } from './lifecycle-worker.ts';
export type DiscordEntitlement = {
  revision: string;
  linked: boolean;
  deleting: boolean;
  has_ever_supported: boolean;
  status: string;
  tier: string;
  expires_at: string | null;
};
type ManagedRoles = { linked: string; supporter: string; tiers: Record<string, string> };
function tierActive(state: DiscordEntitlement, now: number): boolean {
  if (!['active', 'past_due'].includes(state.status)) return false;
  return state.expires_at === null || Date.parse(state.expires_at) > now;
}
export function desiredDiscordRoles(
  state: DiscordEntitlement,
  roles: ManagedRoles,
  now = Date.now()
): string[] {
  if (unlinkedOrDeleting(state)) return [];
  const desired = [roles.linked];
  if (state.has_ever_supported) desired.push(roles.supporter);
  if (tierActive(state, now)) desired.push(roles.tiers[state.tier]);
  return [...new Set(desired.filter(Boolean))];
}
async function applyRoles(
  config: DiscordCleanupConfig,
  desired: string[],
  id: string,
  fetcher: typeof fetch
) {
  const remove = config.managedRoleIds.filter((role) => !desired.includes(role));
  if (remove.length) await discordRoleCleanup({ ...config, managedRoleIds: remove }, fetcher)(id);
  if (desired.length)
    await discordRoleCleanup({ ...config, managedRoleIds: desired }, fetcher, 'PUT')(id);
}
/** Re-read desired state after external requests. No database lock spans provider I/O. */
export async function reconcileDiscordLifecycle(
  work: LifecycleWork,
  load: (work: LifecycleWork) => Promise<DiscordEntitlement>,
  config: DiscordCleanupConfig,
  roles: ManagedRoles,
  fetcher: typeof fetch
): Promise<void> {
  if (!work.resource_id) throw new ProviderFailure('missing_identifier', false);
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await load(work);
    await applyRoles(config, desiredDiscordRoles(before, roles), work.resource_id, fetcher);
    const after = await load(work);
    if (before.revision === after.revision) return;
  }
  throw new ProviderFailure('discord_state_changed', true);
}
function unlinkedOrDeleting(state: DiscordEntitlement) {
  return !state.linked || state.deleting;
}
