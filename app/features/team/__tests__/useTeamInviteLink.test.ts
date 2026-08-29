// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import type { SystemState } from '@/types/tarkov';
const mockSystemState = reactive<SystemState>({
  pvp_team_id: 'team-1',
  team: 'team-1',
  team_id: 'team-1',
});
const mockTeamStore = reactive({ id: 'team-1', inviteCode: 'private-code' });
vi.mock('@/stores/useSystemStore', async () => {
  const actual =
    await vi.importActual<typeof import('@/stores/useSystemStore')>('@/stores/useSystemStore');
  return {
    ...actual,
    useSystemStoreWithSupabase: () => ({ systemStore: { $state: mockSystemState } }),
  };
});
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({ getCurrentGameMode: () => 'pvp' }),
}));
vi.mock('@/stores/useTeamStore', () => ({
  useTeamStoreWithSupabase: () => ({ teamStore: mockTeamStore }),
}));
describe('useTeamInviteLink', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/team#members');
    mockTeamStore.id = 'team-1';
    mockTeamStore.inviteCode = 'private-code';
  });
  it('places invite parameters before an existing fragment', async () => {
    const { useTeamInviteLink } = await import('@/features/team/useTeamInviteLink');
    const { maskedTeamUrl, teamUrl } = useTeamInviteLink();
    const inviteUrl = new URL(teamUrl.value);
    expect(inviteUrl.searchParams.get('team')).toBe('team-1');
    expect(inviteUrl.searchParams.get('code')).toBe('private-code');
    expect(inviteUrl.hash).toBe('#members');
    expect(teamUrl.value.indexOf('?')).toBeLessThan(teamUrl.value.indexOf('#'));
    expect(maskedTeamUrl.value).not.toContain('private-code');
  });
  it('reactively removes an invite URL when the loaded team becomes stale', async () => {
    const { useTeamInviteLink } = await import('@/features/team/useTeamInviteLink');
    const { teamUrl } = useTeamInviteLink();
    expect(teamUrl.value).toContain('code=private-code');
    mockTeamStore.id = 'different-team';
    expect(teamUrl.value).toBe('');
  });
});
