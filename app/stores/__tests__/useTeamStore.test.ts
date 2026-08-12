import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTaskCompletionBroadcast,
  mergeMemberProfileBroadcast,
  mergeTaskCompletionBroadcast,
  resolveTeammateIdentity,
  useTeamStore,
} from '@/stores/useTeamStore';
import type { TeamState, MemberProfile } from '@/types/tarkov';
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
  describe('task completion broadcasts', () => {
    it('preserves explicit active and canonicalizes newer legacy states', () => {
      expect(
        createTaskCompletionBroadcast({ active: true, complete: false, failed: false })
      ).toEqual({ active: true, complete: false, failed: false });
      expect(createTaskCompletionBroadcast({ complete: false, failed: false })).toEqual({
        complete: false,
        failed: false,
      });
      expect(
        mergeTaskCompletionBroadcast(
          { active: true, complete: false, failed: false },
          { complete: false, failed: false }
        )
      ).toEqual({ complete: false, failed: false });
      expect(
        mergeTaskCompletionBroadcast(
          { active: true, complete: false, failed: false },
          { complete: true, failed: false }
        )
      ).toEqual({ active: false, complete: true, failed: false });
      expect(
        mergeTaskCompletionBroadcast(
          { active: true, complete: false, failed: false },
          { complete: true, failed: true }
        )
      ).toEqual({ active: false, complete: true, failed: true });
      expect(
        mergeTaskCompletionBroadcast(
          { active: true, complete: false, failed: false },
          { active: false, complete: true, failed: false }
        )
      ).toEqual({ active: false, complete: true, failed: false });
      expect(createTaskCompletionBroadcast({ complete: true, failed: false })).toEqual({
        active: false,
        complete: true,
        failed: false,
      });
    });
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
    it('should handle progress broadcast update pattern', () => {
      const store = useTeamStore();
      const initialProfile: MemberProfile = {
        displayName: 'Player',
        gameEdition: 4,
        gameMode: 'seasonal',
        level: 10,
        tasksCompleted: 5,
      };
      patchTeamState(store, { memberProfiles: { 'user-1': initialProfile } });
      const broadcastData = {
        userId: 'user-1',
        displayName: 'UpdatedPlayer',
        gameEdition: 99,
        gameMode: 'pve' as const,
        level: 15,
        tasksCompleted: 10,
      };
      store.$patch((state) => {
        state.memberProfiles = mergeMemberProfileBroadcast(
          state.memberProfiles || {},
          broadcastData
        );
      });
      expect(store.memberProfiles?.['user-1']?.level).toBe(15);
      expect(store.memberProfiles?.['user-1']?.tasksCompleted).toBe(10);
      expect(store.memberProfiles?.['user-1']?.gameEdition).toBe(4);
      expect(store.memberProfiles?.['user-1']?.gameMode).toBe('seasonal');
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
