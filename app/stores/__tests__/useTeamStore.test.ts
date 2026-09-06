import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyLegacyPersistentProgressResult,
  applyTeammateProgressEvent,
  buildMemberProgressFilter,
  fetchLegacyTeammateProgress,
  resolveTeammateIdentity,
  useTeamStore,
  useTeamStoreWithSupabase,
} from '@/stores/useTeamStore';
import { GAME_MODES, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import type { TeamState, MemberProfile } from '@/types/tarkov';
const { mockGetTeamMembers, mockUseSupabaseListener } = vi.hoisted(() => ({
  mockGetTeamMembers: vi.fn(),
  mockUseSupabaseListener: vi.fn(),
}));
vi.mock('@/composables/api/useEdgeFunctions', () => ({
  useEdgeFunctions: () => ({ getTeamMembers: mockGetTeamMembers }),
}));
vi.mock('@/composables/supabase/useSupabaseListener', () => ({
  useSupabaseListener: mockUseSupabaseListener,
}));
type TeamPatch = Omit<Partial<TeamState>, 'members'> & {
  join_code?: string | null;
  members?: TeamState['members'] | null;
};
const patchTeamState = (store: ReturnType<typeof useTeamStore>, patch: TeamPatch): void => {
  store.$patch((state) => {
    if ('owner' in patch) state.owner = patch.owner;
    if ('joinCode' in patch) state.joinCode = patch.joinCode;
    if ('members' in patch) {
      (state as Omit<TeamState, 'members'> & { members?: TeamState['members'] | null }).members =
        patch.members;
    }
    if ('memberProfiles' in patch) state.memberProfiles = patch.memberProfiles;
    if ('join_code' in patch) {
      (state as TeamState & { join_code?: string | null }).join_code = patch.join_code;
    }
  });
};
const setCurrentUser = (userId?: string) => {
  const nuxtApp = useNuxtApp() as {
    $supabase?: {
      user?: { id?: string } | null;
    };
  };
  if (!nuxtApp.$supabase) {
    nuxtApp.$supabase = {};
  }
  nuxtApp.$supabase.user = userId ? { id: userId } : null;
};
describe('useTeamStore', () => {
  let pinia: ReturnType<typeof createPinia>;
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.clearAllMocks();
  });
  describe('Default State Initialization', () => {
    it('should initialize with default null values', () => {
      const store = useTeamStore();
      expect(store.owner).toBeNull();
      expect(store.joinCode).toBeNull();
    });
    it('should initialize with empty members array', () => {
      const store = useTeamStore();
      expect(store.members).toEqual([]);
    });
    it('should initialize with empty memberProfiles object', () => {
      const store = useTeamStore();
      expect(store.memberProfiles).toEqual({});
    });
    it('should have all expected state properties', () => {
      const store = useTeamStore();
      const stateKeys = Object.keys(store.$state);
      expect(stateKeys).toContain('owner');
      expect(stateKeys).toContain('joinCode');
      expect(stateKeys).toContain('members');
      expect(stateKeys).toContain('memberProfiles');
    });
  });
  describe('State Reset', () => {
    it('should reset state to default values', () => {
      const store = useTeamStore();
      patchTeamState(store, {
        owner: 'user-1',
        joinCode: 'ABC123',
        members: ['user-1', 'user-2'],
        memberProfiles: {
          'user-1': { displayName: 'Player 1', level: 15, tasksCompleted: 10 },
        },
      });
      store.$reset();
      expect(store.owner).toBeNull();
      expect(store.joinCode).toBeNull();
      expect(store.members).toEqual([]);
      expect(store.memberProfiles).toEqual({});
    });
    it('should clear members array on reset', () => {
      const store = useTeamStore();
      patchTeamState(store, { members: ['user-1', 'user-2', 'user-3'] });
      store.$reset();
      expect(store.members).toEqual([]);
    });
    it('should clear memberProfiles on reset', () => {
      const store = useTeamStore();
      const profiles: Record<string, MemberProfile> = {
        'user-1': { displayName: 'Player 1', level: 10, tasksCompleted: 5 },
        'user-2': { displayName: 'Player 2', level: 20, tasksCompleted: 15 },
      };
      patchTeamState(store, { memberProfiles: profiles });
      store.$reset();
      expect(store.memberProfiles).toEqual({});
    });
  });
  describe('Getters - teamOwner', () => {
    it('should return null when owner is null', () => {
      const store = useTeamStore();
      expect(store.teamOwner).toBeNull();
    });
    it('should return owner value when set', () => {
      const store = useTeamStore();
      patchTeamState(store, { owner: 'user-1' });
      expect(store.teamOwner).toBe('user-1');
    });
    it('should return null when owner is undefined', () => {
      const store = useTeamStore();
      patchTeamState(store, { owner: undefined });
      expect(store.teamOwner).toBeNull();
    });
  });
  describe('Getters - inviteCode', () => {
    it('should return null when joinCode is null', () => {
      const store = useTeamStore();
      expect(store.inviteCode).toBeNull();
    });
    it('should return joinCode value when set', () => {
      const store = useTeamStore();
      patchTeamState(store, { joinCode: 'INVITE123' });
      expect(store.inviteCode).toBe('INVITE123');
    });
    it('should prefer joinCode over join_code', () => {
      const store = useTeamStore();
      patchTeamState(store, {
        joinCode: 'PRIMARY123',
        join_code: 'FALLBACK123',
      });
      expect(store.inviteCode).toBe('PRIMARY123');
    });
  });
  describe('Getters - teamMembers', () => {
    it('should return empty array when members is empty', () => {
      const store = useTeamStore();
      expect(store.teamMembers).toEqual([]);
    });
    it('should return members array when set', () => {
      const store = useTeamStore();
      patchTeamState(store, { members: ['user-1', 'user-2', 'user-3'] });
      expect(store.teamMembers).toEqual(['user-1', 'user-2', 'user-3']);
    });
    it('should return empty array when members is undefined', () => {
      const store = useTeamStore();
      patchTeamState(store, { members: undefined });
      expect(store.teamMembers).toEqual([]);
    });
    it('should return empty array when members is null', () => {
      const store = useTeamStore();
      patchTeamState(store, { members: null });
      expect(store.teamMembers).toEqual([]);
    });
  });
  describe('State Mutations - $patch', () => {
    it('should update owner via $patch', () => {
      const store = useTeamStore();
      patchTeamState(store, { owner: 'new-owner' });
      expect(store.owner).toBe('new-owner');
    });
    it('should update joinCode via $patch', () => {
      const store = useTeamStore();
      patchTeamState(store, { joinCode: 'NEWCODE' });
      expect(store.joinCode).toBe('NEWCODE');
    });
    it('should update members via $patch', () => {
      const store = useTeamStore();
      patchTeamState(store, { members: ['member-1', 'member-2'] });
      expect(store.members).toEqual(['member-1', 'member-2']);
    });
    it('should update memberProfiles via $patch', () => {
      const store = useTeamStore();
      const profiles: Record<string, MemberProfile> = {
        'user-1': { displayName: 'Test User', level: 25, tasksCompleted: 30 },
      };
      patchTeamState(store, { memberProfiles: profiles });
      expect(store.memberProfiles).toEqual(profiles);
    });
    it('should update multiple properties at once', () => {
      const store = useTeamStore();
      patchTeamState(store, {
        owner: 'owner-1',
        joinCode: 'CODE123',
        members: ['owner-1', 'member-1'],
      });
      expect(store.owner).toBe('owner-1');
      expect(store.joinCode).toBe('CODE123');
      expect(store.members).toEqual(['owner-1', 'member-1']);
    });
    it('should support function patcher for complex updates', () => {
      const store = useTeamStore();
      patchTeamState(store, { members: ['user-1'] });
      store.$patch((state) => {
        state.members?.push('user-2');
      });
      expect(store.members).toEqual(['user-1', 'user-2']);
    });
    it('should merge memberProfiles correctly', () => {
      const store = useTeamStore();
      const initialProfiles: Record<string, MemberProfile> = {
        'user-1': { displayName: 'User 1', level: 10, tasksCompleted: 5 },
      };
      patchTeamState(store, { memberProfiles: initialProfiles });
      store.$patch((state) => {
        state.memberProfiles = {
          ...state.memberProfiles,
          'user-2': { displayName: 'User 2', level: 20, tasksCompleted: 10 },
        } as Record<string, MemberProfile>;
      });
      expect(store.memberProfiles?.['user-1']).toBeDefined();
      expect(store.memberProfiles?.['user-2']).toBeDefined();
    });
  });
  describe('Team Data Transformation', () => {
    it('should handle database field mapping owner_id to owner', () => {
      const store = useTeamStore();
      const dbData = { owner_id: 'db-owner-1' };
      const transformed = {
        owner: dbData.owner_id,
      };
      patchTeamState(store, transformed);
      expect(store.owner).toBe('db-owner-1');
    });
    it('should handle database field mapping join_code to joinCode', () => {
      const store = useTeamStore();
      const dbData = { join_code: 'DB-CODE-123' };
      const transformed = {
        joinCode: dbData.join_code,
      };
      patchTeamState(store, transformed);
      expect(store.joinCode).toBe('DB-CODE-123');
    });
    it('should handle null owner_id from database', () => {
      const store = useTeamStore();
      patchTeamState(store, { owner: 'existing-owner' });
      const dbData = { owner_id: null };
      const transformed = {
        owner: dbData.owner_id,
      };
      patchTeamState(store, transformed);
      expect(store.owner).toBeNull();
    });
    it('should handle null join_code from database', () => {
      const store = useTeamStore();
      patchTeamState(store, { joinCode: 'existing-code' });
      const dbData = { join_code: null };
      const transformed = {
        joinCode: dbData.join_code,
      };
      patchTeamState(store, transformed);
      expect(store.joinCode).toBeNull();
    });
  });
  describe('Member Profiles Management', () => {
    it('should store member profile data', () => {
      const store = useTeamStore();
      const profile: MemberProfile = {
        displayName: 'TestPlayer',
        level: 30,
        tasksCompleted: 45,
      };
      patchTeamState(store, {
        memberProfiles: { 'user-1': profile },
      });
      expect(store.memberProfiles?.['user-1']).toEqual(profile);
    });
    it('should store gameMode in member profile', () => {
      const store = useTeamStore();
      const profile: MemberProfile = {
        displayName: 'TestPlayer',
        level: 30,
        tasksCompleted: 45,
        gameMode: 'pve',
      };
      patchTeamState(store, {
        memberProfiles: { 'user-1': profile },
      });
      expect(store.memberProfiles?.['user-1']?.gameMode).toBe('pve');
    });
    it('should handle null displayName in profile', () => {
      const store = useTeamStore();
      const profile: MemberProfile = {
        displayName: null,
        level: 15,
        tasksCompleted: 10,
      };
      patchTeamState(store, {
        memberProfiles: { 'user-1': profile },
      });
      expect(store.memberProfiles?.['user-1']?.displayName).toBeNull();
    });
    it('should handle null level in profile', () => {
      const store = useTeamStore();
      const profile: MemberProfile = {
        displayName: 'Player',
        level: null,
        tasksCompleted: 5,
      };
      patchTeamState(store, {
        memberProfiles: { 'user-1': profile },
      });
      expect(store.memberProfiles?.['user-1']?.level).toBeNull();
    });
    it('should handle null tasksCompleted in profile', () => {
      const store = useTeamStore();
      const profile: MemberProfile = {
        displayName: 'Player',
        level: 10,
        tasksCompleted: null,
      };
      patchTeamState(store, {
        memberProfiles: { 'user-1': profile },
      });
      expect(store.memberProfiles?.['user-1']?.tasksCompleted).toBeNull();
    });
    it('should update existing member profile', () => {
      const store = useTeamStore();
      const initialProfile: MemberProfile = {
        displayName: 'Player',
        level: 10,
        tasksCompleted: 5,
      };
      patchTeamState(store, {
        memberProfiles: { 'user-1': initialProfile },
      });
      const updatedProfile: MemberProfile = {
        displayName: 'UpdatedPlayer',
        level: 20,
        tasksCompleted: 15,
      };
      patchTeamState(store, {
        memberProfiles: { 'user-1': updatedProfile },
      });
      expect(store.memberProfiles?.['user-1']).toEqual(updatedProfile);
    });
    it('should handle multiple member profiles', () => {
      const store = useTeamStore();
      const profiles: Record<string, MemberProfile> = {
        'user-1': { displayName: 'Player 1', level: 10, tasksCompleted: 5 },
        'user-2': { displayName: 'Player 2', level: 20, tasksCompleted: 15 },
        'user-3': { displayName: 'Player 3', level: 30, tasksCompleted: 25 },
      };
      patchTeamState(store, { memberProfiles: profiles });
      expect(Object.keys(store.memberProfiles ?? {})).toHaveLength(3);
      expect(store.memberProfiles?.['user-2']?.level).toBe(20);
    });
  });
  describe('Edge Cases - Empty Team', () => {
    it('should handle team with no members', () => {
      const store = useTeamStore();
      patchTeamState(store, {
        owner: 'user-1',
        joinCode: 'TEAM123',
        members: [],
      });
      expect(store.teamMembers).toEqual([]);
      expect(store.teamOwner).toBe('user-1');
      expect(store.inviteCode).toBe('TEAM123');
    });
    it('should handle team with only owner as member', () => {
      const store = useTeamStore();
      patchTeamState(store, {
        owner: 'user-1',
        members: ['user-1'],
      });
      expect(store.teamMembers).toEqual(['user-1']);
    });
  });
  describe('Edge Cases - Invalid Data', () => {
    it('should handle undefined state gracefully', () => {
      const store = useTeamStore();
      patchTeamState(store, {
        owner: undefined,
        joinCode: undefined,
        members: undefined,
      });
      expect(store.owner).toBeUndefined();
      expect(store.joinCode).toBeUndefined();
      expect(store.members).toBeUndefined();
    });
    it('should handle empty string joinCode - inviteCode returns null for falsy', () => {
      const store = useTeamStore();
      patchTeamState(store, { joinCode: '' });
      expect(store.joinCode).toBe('');
      expect(store.inviteCode).toBeNull();
    });
    it('should handle empty string owner - teamOwner returns null for falsy', () => {
      const store = useTeamStore();
      patchTeamState(store, { owner: '' });
      expect(store.owner).toBe('');
      expect(store.teamOwner).toBeNull();
    });
  });
  describe('Reactive Updates', () => {
    it('should reflect owner changes in teamOwner getter', () => {
      const store = useTeamStore();
      expect(store.teamOwner).toBeNull();
      patchTeamState(store, { owner: 'new-owner' });
      expect(store.teamOwner).toBe('new-owner');
      patchTeamState(store, { owner: 'another-owner' });
      expect(store.teamOwner).toBe('another-owner');
    });
    it('should reflect joinCode changes in inviteCode getter', () => {
      const store = useTeamStore();
      expect(store.inviteCode).toBeNull();
      patchTeamState(store, { joinCode: 'CODE1' });
      expect(store.inviteCode).toBe('CODE1');
      patchTeamState(store, { joinCode: 'CODE2' });
      expect(store.inviteCode).toBe('CODE2');
    });
  });
  describe('Member List Operations', () => {
    it('should handle adding a member', () => {
      const store = useTeamStore();
      patchTeamState(store, { members: ['user-1', 'user-2'] });
      store.$patch((state) => {
        state.members?.push('user-3');
      });
      expect(store.members).toContain('user-3');
      expect(store.members).toHaveLength(3);
    });
    it('should handle removing a member', () => {
      const store = useTeamStore();
      patchTeamState(store, { members: ['user-1', 'user-2', 'user-3'] });
      store.$patch((state) => {
        if (state.members) {
          state.members = state.members.filter((m) => m !== 'user-2');
        }
      });
      expect(store.members).not.toContain('user-2');
      expect(store.members).toHaveLength(2);
    });
    it('should handle clearing all members', () => {
      const store = useTeamStore();
      patchTeamState(store, { members: ['user-1', 'user-2', 'user-3'] });
      patchTeamState(store, { members: [] });
      expect(store.members).toEqual([]);
    });
    it('should handle duplicate member prevention', () => {
      const store = useTeamStore();
      patchTeamState(store, { members: ['user-1', 'user-2'] });
      store.$patch((state) => {
        if (state.members && !state.members.includes('user-1')) {
          state.members.push('user-1');
        }
      });
      expect((store.members ?? []).filter((m) => m === 'user-1')).toHaveLength(1);
    });
  });
  describe('Store ID', () => {
    it('should have correct store id', () => {
      const store = useTeamStore();
      expect(store.$id).toBe('team');
    });
  });
  describe('Concurrent Updates', () => {
    it('should handle rapid sequential patches', () => {
      const store = useTeamStore();
      for (let i = 0; i < 10; i++) {
        patchTeamState(store, {
          owner: `owner-${i}`,
          joinCode: `CODE-${i}`,
        });
      }
      expect(store.owner).toBe('owner-9');
      expect(store.joinCode).toBe('CODE-9');
    });
    it('should handle member additions in sequence', () => {
      const store = useTeamStore();
      patchTeamState(store, { members: [] });
      for (let i = 1; i <= 5; i++) {
        store.$patch((state) => {
          state.members?.push(`user-${i}`);
        });
      }
      expect(store.members).toHaveLength(5);
    });
  });
  describe('Profile Data Updates', () => {
    it('refreshes a retained teammate identity when mode and edition change', () => {
      const initial = resolveTeammateIdentity(undefined, 'pvp');
      const refreshed = resolveTeammateIdentity(
        {
          displayName: 'Player',
          gameEdition: 4,
          gameMode: 'seasonal',
          level: 10,
          tasksCompleted: 5,
        },
        initial.currentGameMode
      );
      expect(initial).toEqual({ currentGameMode: 'pvp', gameEdition: 1 });
      expect(refreshed).toEqual({ currentGameMode: 'seasonal', gameEdition: 4 });
    });
  });
});
describe('Team Store Getter Logic', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });
  describe('isOwner getter', () => {
    it('should return true when owner matches user id', () => {
      setCurrentUser('user-1');
      const store = useTeamStore();
      patchTeamState(store, { owner: 'user-1' });
      expect(store.isOwner).toBe(true);
    });
    it('should return false when owner does not match user id', () => {
      setCurrentUser('user-1');
      const store = useTeamStore();
      patchTeamState(store, { owner: 'user-2' });
      expect(store.isOwner).toBe(false);
    });
    it('should return false when owner is null', () => {
      setCurrentUser('user-1');
      const store = useTeamStore();
      patchTeamState(store, { owner: null });
      expect(store.isOwner).toBe(false);
    });
    it('should return false when user is not logged in', () => {
      setCurrentUser();
      const store = useTeamStore();
      patchTeamState(store, { owner: 'user-1' });
      expect(store.isOwner).toBe(false);
    });
  });
  describe('teammates getter', () => {
    it('should filter out current user from members list', () => {
      setCurrentUser('user-1');
      const store = useTeamStore();
      patchTeamState(store, { members: ['user-1', 'user-2', 'user-3'] });
      expect(store.teammates).toEqual(['user-2', 'user-3']);
    });
    it('should return all members if current user is not in list', () => {
      setCurrentUser('user-1');
      const store = useTeamStore();
      patchTeamState(store, { members: ['user-2', 'user-3'] });
      expect(store.teammates).toEqual(['user-2', 'user-3']);
    });
    it('should return empty array if user is not logged in', () => {
      setCurrentUser();
      const store = useTeamStore();
      patchTeamState(store, { members: ['user-1', 'user-2'] });
      expect(store.teammates).toEqual([]);
    });
    it('should return empty array for empty members list', () => {
      setCurrentUser('user-1');
      const store = useTeamStore();
      patchTeamState(store, { members: [] });
      expect(store.teammates).toEqual([]);
    });
    it('should handle single member who is self', () => {
      setCurrentUser('user-1');
      const store = useTeamStore();
      patchTeamState(store, { members: ['user-1'] });
      expect(store.teammates).toEqual([]);
    });
    it('should handle member additions correctly', () => {
      setCurrentUser('user-1');
      const store = useTeamStore();
      patchTeamState(store, { members: ['user-1', 'user-2'] });
      expect(store.teammates).toEqual(['user-2']);
      patchTeamState(store, { members: ['user-1', 'user-2', 'user-3'] });
      expect(store.teammates).toEqual(['user-2', 'user-3']);
    });
    it('should handle member removals correctly', () => {
      setCurrentUser('user-1');
      const store = useTeamStore();
      patchTeamState(store, { members: ['user-1', 'user-2', 'user-3'] });
      expect(store.teammates).toEqual(['user-2', 'user-3']);
      patchTeamState(store, { members: ['user-1', 'user-3'] });
      expect(store.teammates).toEqual(['user-3']);
    });
  });
});
describe('applyTeammateProgressEvent', () => {
  const viewerId = '11111111-1111-4111-8111-111111111111';
  const teammateId = '22222222-2222-4222-8222-222222222222';
  const outsiderId = '33333333-3333-4333-8333-333333333333';
  const progressData = {
    displayName: 'Teammate',
    level: 30,
    taskCompletions: { taskA: { complete: true } },
  };
  const event = (overrides: Record<string, unknown> = {}) => ({
    game_mode: GAME_MODES.PVP,
    progress_data: progressData,
    season_number: 0,
    user_id: teammateId,
    ...overrides,
  });
  const seed = (profiles: Record<string, MemberProfile> = {}) => {
    setActivePinia(createPinia());
    const store = useTeamStore();
    patchTeamState(store, { memberProfiles: profiles, members: [viewerId, teammateId] });
    return store;
  };
  it('applies an active-season event for a tracked teammate', () => {
    const store = seed();
    applyTeammateProgressEvent(store, viewerId, event());
    expect(store.memberProfiles?.[teammateId]).toMatchObject({
      displayName: 'Teammate',
      gameMode: GAME_MODES.PVP,
      level: 30,
      tasksCompleted: 1,
    });
  });
  it("ignores the viewer's own row", () => {
    const store = seed();
    applyTeammateProgressEvent(store, viewerId, event({ user_id: viewerId }));
    expect(store.memberProfiles?.[viewerId]).toBeUndefined();
  });
  it('ignores a user who is not a team member', () => {
    const store = seed();
    applyTeammateProgressEvent(store, viewerId, event({ user_id: outsiderId }));
    expect(store.memberProfiles?.[outsiderId]).toBeUndefined();
  });
  it('ignores a non-active season row', () => {
    const store = seed();
    applyTeammateProgressEvent(store, viewerId, event({ season_number: 1 }));
    expect(store.memberProfiles?.[teammateId]).toBeUndefined();
  });
  it('ignores an unsupported game mode', () => {
    const store = seed();
    applyTeammateProgressEvent(store, viewerId, event({ game_mode: 'arena' }));
    expect(store.memberProfiles?.[teammateId]).toBeUndefined();
  });
  it('ignores an event for a mode the profile is not pinned to', () => {
    const store = seed({
      [teammateId]: {
        displayName: 'Teammate',
        gameEdition: 4,
        gameMode: GAME_MODES.PVE,
        level: 5,
        tasksCompleted: 0,
      },
    });
    applyTeammateProgressEvent(store, viewerId, event());
    expect(store.memberProfiles?.[teammateId]?.level).toBe(5);
  });
  it('ignores an unmaterialized progress blob', () => {
    const store = seed();
    applyTeammateProgressEvent(store, viewerId, event({ progress_data: {} }));
    expect(store.memberProfiles?.[teammateId]).toBeUndefined();
  });
  it('preserves the existing game edition', () => {
    const store = seed({
      [teammateId]: {
        displayName: 'Teammate',
        gameEdition: 4,
        gameMode: GAME_MODES.PVP,
        level: 5,
        tasksCompleted: 0,
      },
    });
    applyTeammateProgressEvent(store, viewerId, event());
    expect(store.memberProfiles?.[teammateId]?.gameEdition).toBe(4);
  });
});
describe('Team realtime resources', () => {
  type ChannelRecord = {
    topic: string;
    config?: unknown;
    channel: { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
    statusCallbacks: Array<(status: string, error?: Error) => void>;
    handlers: Array<{
      config: { table?: string };
      handler: (payload: { eventType: string; new: Record<string, unknown> }) => void;
    }>;
  };
  const buildRealtimeHarness = () => {
    const currentUserId = '11111111-1111-4111-8111-111111111111';
    const teammateId = '22222222-2222-4222-8222-222222222222';
    const records: ChannelRecord[] = [];
    const createRecord = (topic: string, config?: unknown): ChannelRecord => {
      const record: ChannelRecord = {
        channel: { on: vi.fn(), subscribe: vi.fn() },
        config,
        handlers: [],
        statusCallbacks: [],
        topic,
      };
      record.channel.on = vi.fn(
        (
          _event: string,
          handlerConfig: { table?: string },
          handler: (payload: { eventType: string; new: Record<string, unknown> }) => void
        ) => {
          record.handlers.push({ config: handlerConfig, handler });
          return record.channel;
        }
      );
      record.channel.subscribe = vi.fn((callback?: (status: string, error?: Error) => void) => {
        if (callback) record.statusCallbacks.push(callback);
        callback?.('SUBSCRIBED');
        return record.channel;
      });
      return record;
    };
    const membershipQuery = {
      eq: vi.fn().mockResolvedValue({
        data: [{ game_mode: GAME_MODES.PVP, team_id: 'team-1' }],
        error: null,
      }),
      select: vi.fn(),
    };
    membershipQuery.select.mockReturnValue(membershipQuery);
    // Mirrors `RealtimeClient.channel()`: an open topic returns the existing
    // channel, so a premature rejoin is observable instead of silently working.
    const openTopics = new Map<string, ChannelRecord>();
    const client = {
      // `useTeamStoreWithSupabase` also initializes the system store, so this
      // mock serves both the `system-team-memberships-*` channel and the
      // `team:*` channel. Records are keyed by topic to keep them apart.
      channel: vi.fn((topic: string, config?: unknown) => {
        const existing = openTopics.get(topic);
        if (existing) return existing.channel;
        const record = createRecord(topic, config);
        records.push(record);
        openTopics.set(topic, record);
        return record.channel;
      }),
      from: vi.fn(() => membershipQuery),
      removeChannel: vi.fn((target: unknown) => {
        for (const [topic, record] of openTopics) {
          if (record.channel === target) openTopics.delete(topic);
        }
        return Promise.resolve('ok');
      }),
    };
    const nuxtApp = useNuxtApp() as unknown as {
      $supabase: {
        client: typeof client;
        ready: () => Promise<null>;
        user: { id: string; loggedIn: boolean };
      };
    };
    nuxtApp.$supabase.client = client;
    nuxtApp.$supabase.ready = vi.fn().mockResolvedValue(null);
    nuxtApp.$supabase.user = { id: currentUserId, loggedIn: true };
    mockGetTeamMembers.mockResolvedValue({
      members: [currentUserId, teammateId],
      profiles: {
        [teammateId]: {
          displayName: 'Teammate',
          gameEdition: 4,
          gameMode: GAME_MODES.PVP,
          level: 10,
          tasksCompleted: 2,
        },
      },
    });
    mockUseSupabaseListener.mockImplementation(() => ({
      cleanup: vi.fn(),
      fetchData: vi.fn(),
      hasInitiallyLoaded: { value: false },
      isSubscribed: { value: false },
      loadError: { value: null },
    }));
    const teamRecords = () => records.filter((record) => record.topic.startsWith('team:'));
    return { client, currentUserId, teamRecords, teammateId };
  };
  const firstTeamRecord = (teamRecords: () => ChannelRecord[]): ChannelRecord => {
    const record = teamRecords()[0];
    if (!record) throw new Error('team channel was never created');
    return record;
  };
  it('filters teammate progress and cleans up scoped subscriptions', async () => {
    const { client, currentUserId, teamRecords, teammateId } = buildRealtimeHarness();
    const instance = useTeamStoreWithSupabase();
    try {
      await vi.waitFor(() => expect(teamRecords()).toHaveLength(1));
      const teamRecord = firstTeamRecord(teamRecords);
      expect(teamRecord.topic).toBe('team:team-1');
      expect(teamRecord.config).toEqual({ config: { private: true } });
      const progressSubscription = teamRecord.handlers.find(
        ({ config }) => config.table === 'user_game_mode_progress'
      );
      expect(progressSubscription?.config).toMatchObject({
        filter: `user_id=in.(${currentUserId},${teammateId})`,
      });
      progressSubscription?.handler({
        eventType: 'UPDATE',
        new: {
          game_mode: GAME_MODES.PVP,
          progress_data: {
            displayName: 'Updated Teammate',
            level: 22,
            taskCompletions: { task: { complete: true } },
          },
          season_number: 0,
          user_id: teammateId,
        },
      });
      expect(instance.teamStore.memberProfiles?.[teammateId]).toMatchObject({
        displayName: 'Updated Teammate',
        gameEdition: 4,
        gameMode: GAME_MODES.PVP,
        level: 22,
        tasksCompleted: 1,
      });
    } finally {
      instance.cleanup();
    }
    await Promise.resolve();
    // Teardown must go through the client that created the channel, so this
    // assertion does not depend on `$supabase.client` still being this mock.
    expect(client.removeChannel).toHaveBeenCalledWith(firstTeamRecord(teamRecords).channel);
  });
  it('does not hydrate or rebuild after a rejected member refresh', async () => {
    const { teamRecords } = buildRealtimeHarness();
    const hydrated = vi.fn();
    window.addEventListener('teammate-progress-reconnected', hydrated);
    const instance = useTeamStoreWithSupabase();
    try {
      await vi.waitFor(() => expect(teamRecords()).toHaveLength(1));
      mockGetTeamMembers.mockRejectedValueOnce(new Error('members unavailable'));
      firstTeamRecord(teamRecords).statusCallbacks[0]?.('SUBSCRIBED');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(hydrated).not.toHaveBeenCalled();
      expect(teamRecords()).toHaveLength(1);
    } finally {
      window.removeEventListener('teammate-progress-reconnected', hydrated);
      instance.cleanup();
    }
  });
  it('hydrates only on rejoin and rebuilds changed member filters before hydration', async () => {
    const { teamRecords, currentUserId, teammateId } = buildRealtimeHarness();
    const hydrated = vi.fn();
    window.addEventListener('teammate-progress-reconnected', hydrated);
    const instance = useTeamStoreWithSupabase();
    try {
      await vi.waitFor(() => expect(teamRecords()).toHaveLength(1));
      expect(hydrated).not.toHaveBeenCalled();
      mockGetTeamMembers.mockResolvedValue({
        members: [currentUserId, teammateId, '44444444-4444-4444-8444-444444444444'],
        profiles: {},
      });
      firstTeamRecord(teamRecords).statusCallbacks[0]?.('SUBSCRIBED');
      await vi.waitFor(() => expect(teamRecords()).toHaveLength(2));
      expect(hydrated).toHaveBeenCalledOnce();
      expect(
        teamRecords()[1]?.handlers.some(
          ({ config }) =>
            config.table === 'user_game_mode_progress' &&
            JSON.stringify(config).includes('44444444')
        )
      ).toBe(true);
    } finally {
      window.removeEventListener('teammate-progress-reconnected', hydrated);
      instance.cleanup();
    }
  });
  it('does not rejoin the team channel when the member set is unchanged', async () => {
    const { client, teamRecords } = buildRealtimeHarness();
    const instance = useTeamStoreWithSupabase();
    try {
      await vi.waitFor(() => expect(teamRecords()).toHaveLength(1));
      const membershipSubscription = firstTeamRecord(teamRecords).handlers.find(
        ({ config }) => config.table === 'team_memberships'
      );
      expect(membershipSubscription).toBeDefined();
      const callsBefore = mockGetTeamMembers.mock.calls.length;
      membershipSubscription?.handler({ eventType: 'UPDATE', new: {} });
      await vi.waitFor(() =>
        expect(mockGetTeamMembers.mock.calls.length).toBeGreaterThan(callsBefore)
      );
      expect(teamRecords()).toHaveLength(1);
      expect(client.removeChannel).not.toHaveBeenCalled();
    } finally {
      instance.cleanup();
    }
  });
  it('rebuilds the team channel on a new topic after the previous one left', async () => {
    const { client, currentUserId, teamRecords, teammateId } = buildRealtimeHarness();
    const instance = useTeamStoreWithSupabase();
    try {
      await vi.waitFor(() => expect(teamRecords()).toHaveLength(1));
      const first = firstTeamRecord(teamRecords);
      // A genuinely different member set changes the progress filter, which is
      // what makes a rebuild necessary.
      mockGetTeamMembers.mockResolvedValue({
        members: [currentUserId, teammateId, '44444444-4444-4444-8444-444444444444'],
        profiles: {},
      });
      const membershipSubscription = first.handlers.find(
        ({ config }) => config.table === 'team_memberships'
      );
      membershipSubscription?.handler({ eventType: 'UPDATE', new: {} });
      await vi.waitFor(() => expect(client.removeChannel).toHaveBeenCalled());
      // The mock returns the live channel for an open topic, so a second record
      // proves the rejoin happened only after the previous leave completed.
      await vi.waitFor(() => expect(teamRecords().length).toBeGreaterThan(1));
      expect(teamRecords()[1]).not.toBe(first);
    } finally {
      instance.cleanup();
    }
  });
  it('reports a failed private channel subscription instead of failing silently', async () => {
    const { teamRecords } = buildRealtimeHarness();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const instance = useTeamStoreWithSupabase();
    try {
      await vi.waitFor(() => expect(teamRecords()).toHaveLength(1));
      firstTeamRecord(teamRecords).statusCallbacks[0]?.(
        'CHANNEL_ERROR',
        new Error('Unauthorized topic')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        '[TeamStore] Realtime channel is not subscribed:',
        expect.objectContaining({ error: 'Unauthorized topic', status: 'CHANNEL_ERROR' })
      );
    } finally {
      instance.cleanup();
      warnSpy.mockRestore();
    }
  });
});
describe('Teammate progress helpers', () => {
  it('builds a filtered membership expression from valid unique IDs', () => {
    const firstMember = '11111111-1111-4111-8111-111111111111';
    const secondMember = '22222222-2222-4222-8222-222222222222';
    expect(buildMemberProgressFilter([firstMember, 'not-a-uuid', firstMember, secondMember])).toBe(
      `user_id=in.(${firstMember},${secondMember})`
    );
  });
  it('omits the progress filter when no valid members are present', () => {
    expect(buildMemberProgressFilter(null)).toBeUndefined();
    expect(buildMemberProgressFilter(['not-a-uuid'])).toBeUndefined();
  });
  it('applies a legacy progress result only when it is usable', () => {
    const applyProgress = vi.fn();
    const appliedModes = new Set<GameMode>();
    applyLegacyPersistentProgressResult(
      { data: { level: 12 }, error: null },
      appliedModes,
      'teammate-1',
      GAME_MODES.PVP,
      applyProgress
    );
    expect(applyProgress).toHaveBeenCalledWith(GAME_MODES.PVP, { level: 12 });
    appliedModes.add(GAME_MODES.PVE);
    applyLegacyPersistentProgressResult(
      { data: { level: 20 }, error: null },
      appliedModes,
      'teammate-1',
      GAME_MODES.PVE,
      applyProgress
    );
    expect(applyProgress).toHaveBeenCalledTimes(1);
    applyLegacyPersistentProgressResult(
      { data: null, error: new Error('denied') },
      appliedModes,
      'teammate-1',
      GAME_MODES.PVP,
      applyProgress
    );
    expect(applyProgress).toHaveBeenCalledTimes(1);
  });
  it('uses the teammate RPC for persistent modes and skips Seasonal', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { level: 12 }, error: null });
    const client = { rpc };
    await expect(
      fetchLegacyTeammateProgress(client, 'teammate-1', GAME_MODES.PVP)
    ).resolves.toEqual({ data: { level: 12 }, error: null });
    expect(rpc).toHaveBeenCalledWith('get_teammate_legacy_progress', {
      p_game_mode: GAME_MODES.PVP,
      p_user_id: 'teammate-1',
    });
    await expect(
      fetchLegacyTeammateProgress(client, 'teammate-1', GAME_MODES.SEASONAL)
    ).resolves.toEqual({ data: null, error: null });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
