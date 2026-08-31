// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { nextTick, reactive, ref } from 'vue';
import type { SystemState } from '@/types/tarkov';
import type { CreateTeamResponse } from '@/types/team';
const mockSupabaseUser = {
  loggedIn: true,
  id: 'user-123',
  displayName: 'User',
  username: 'user',
  email: 'user@example.com',
};
const mockSupabaseClient = {
  from: vi.fn(),
};
const mockToast = {
  add: vi.fn(),
};
const mockCopyToClipboard = vi.fn(async () => true);
mockNuxtImport('useRouter', () => () => ({
  beforeEach: vi.fn(),
  beforeResolve: vi.fn(),
  onError: vi.fn(),
  afterEach: vi.fn(),
}));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user: mockSupabaseUser,
    client: mockSupabaseClient,
  },
}));
mockNuxtImport('useToast', () => () => mockToast);
const mockTarkovStore = {
  getCurrentGameMode: vi.fn(() => 'pvp'),
  getDisplayName: vi.fn(() => 'TestPMC'),
  setDisplayName: vi.fn(),
};
const mockEdgeFunctions = {
  createTeam: vi.fn(),
};
const mockSystemState = reactive<SystemState>({
  user_id: null,
  team: null,
  team_id: null,
  pvp_team_id: null,
  pve_team_id: null,
  is_admin: false,
});
const mockHasInitiallyLoaded = ref(true);
const mockSystemStore = {
  $state: mockSystemState,
  $patch: vi.fn((patch: Partial<SystemState>) => Object.assign(mockSystemState, patch)),
};
const mockTeamState = reactive({
  id: null as string | null,
  owner: null as string | null,
  owner_id: null as string | null,
  joinCode: null as string | null,
  join_code: null as string | null,
  members: [] as string[],
});
const mockTeamStore = {
  $state: mockTeamState,
  get id() {
    return mockTeamState.id;
  },
  get inviteCode() {
    return mockTeamState.joinCode ?? mockTeamState.join_code ?? null;
  },
  $patch: vi.fn((patch: Record<string, unknown> | ((state: typeof mockTeamState) => void)) => {
    if (typeof patch === 'function') {
      patch(mockTeamState);
      return;
    }
    Object.assign(mockTeamState, patch);
  }),
  $reset: vi.fn(() => {
    mockTeamState.id = null;
    mockTeamState.owner = null;
    mockTeamState.owner_id = null;
    mockTeamState.joinCode = null;
    mockTeamState.join_code = null;
    mockTeamState.members = [];
  }),
};
vi.mock('@/composables/api/useEdgeFunctions', () => ({
  useEdgeFunctions: () => mockEdgeFunctions,
}));
vi.mock('@/composables/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard: mockCopyToClipboard }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => mockTarkovStore,
}));
vi.mock('@/stores/useTeamStore', () => ({
  useTeamStoreWithSupabase: () => ({
    teamStore: mockTeamStore,
  }),
}));
vi.mock('@/stores/useSystemStore', async () => {
  const actual =
    await vi.importActual<typeof import('@/stores/useSystemStore')>('@/stores/useSystemStore');
  return {
    ...actual,
    useSystemStoreWithSupabase: () => ({
      systemStore: mockSystemStore,
      hasInitiallyLoaded: mockHasInitiallyLoaded,
    }),
  };
});
vi.mock('@/utils/async', () => ({
  delay: () => Promise.resolve(),
}));
vi.mock('@/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
mockNuxtImport('useI18n', () => () => ({
  t: (key: string) => key,
}));
const UButtonStub = {
  props: ['disabled', 'loading'],
  emits: ['click'],
  template:
    '<button :disabled="disabled" :data-loading="loading" @click="$emit(\'click\')"><slot /></button>',
};
const mountMyTeam = async () => {
  const { default: MyTeam } = await import('@/features/team/MyTeam.vue');
  return mount(MyTeam, {
    global: {
      stubs: {
        TeamCard: { template: '<div><slot name="icon" /><slot /></div>' },
        UButton: UButtonStub,
        UIcon: true,
      },
      mocks: {
        $t: (key: string) => key,
      },
    },
  });
};
const setupMembershipQueries = (teamId: string) => {
  let membershipCall = 0;
  mockSupabaseClient.from = vi.fn((table: string) => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      delete: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => {
        if (table === 'team_memberships') {
          membershipCall += 1;
          if (membershipCall === 1) {
            return { data: null, error: null };
          }
          return { data: { team_id: teamId, game_mode: 'pvp' }, error: null };
        }
        return { data: null, error: null };
      }),
    };
    return chain;
  });
};
describe('MyTeam store interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.from = vi.fn();
    mockSupabaseUser.loggedIn = true;
    mockSupabaseUser.id = 'user-123';
    mockSupabaseUser.displayName = 'User';
    mockSupabaseUser.username = 'user';
    mockSupabaseUser.email = 'user@example.com';
    mockEdgeFunctions.createTeam.mockReset();
    mockTarkovStore.getCurrentGameMode.mockReturnValue('pvp');
    mockTarkovStore.getDisplayName.mockReturnValue('TestPMC');
    mockSystemState.user_id = null;
    mockSystemState.team = null;
    mockSystemState.team_id = null;
    mockSystemState.pvp_team_id = null;
    mockSystemState.pve_team_id = null;
    mockSystemState.is_admin = false;
    mockTeamState.id = null;
    mockTeamState.owner = null;
    mockTeamState.owner_id = null;
    mockTeamState.joinCode = null;
    mockTeamState.join_code = null;
    mockTeamState.members = [];
    mockHasInitiallyLoaded.value = true;
    mockCopyToClipboard.mockReset();
    mockCopyToClipboard.mockResolvedValue(true);
  });
  describe('getTeamIdFromState', () => {
    it('returns pvp_team_id for pvp game mode', async () => {
      const { getTeamIdFromState } = await import('@/stores/useSystemStore');
      const result = getTeamIdFromState(
        { pvp_team_id: 'team-pvp-123', pve_team_id: null } as SystemState,
        'pvp'
      );
      expect(result).toBe('team-pvp-123');
    });
    it('returns pve_team_id for pve game mode', async () => {
      const { getTeamIdFromState } = await import('@/stores/useSystemStore');
      const result = getTeamIdFromState(
        { pvp_team_id: null, pve_team_id: 'team-pve-456' } as SystemState,
        'pve'
      );
      expect(result).toBe('team-pve-456');
    });
    it('returns null when no team is set', async () => {
      const { getTeamIdFromState } = await import('@/stores/useSystemStore');
      const pvpResult = getTeamIdFromState(
        { pvp_team_id: null, pve_team_id: null } as SystemState,
        'pvp'
      );
      const pveResult = getTeamIdFromState(
        { pvp_team_id: null, pve_team_id: null } as SystemState,
        'pve'
      );
      expect(pvpResult).toBeNull();
      expect(pveResult).toBeNull();
    });
    it('handles separate team IDs for each game mode', async () => {
      const { getTeamIdFromState } = await import('@/stores/useSystemStore');
      const state = { pvp_team_id: 'team-pvp-123', pve_team_id: 'team-pve-456' } as SystemState;
      expect(getTeamIdFromState(state, 'pvp')).toBe('team-pvp-123');
      expect(getTeamIdFromState(state, 'pve')).toBe('team-pve-456');
    });
  });
  describe('destructive actions', () => {
    it('keeps destructive membership actions outside the invite card', async () => {
      mockSystemState.pvp_team_id = 'team-123';
      mockTeamState.owner_id = 'user-123';
      const wrapper = await mountMyTeam();
      expect(wrapper.find('[data-testid="open-team-danger-confirmation"]').exists()).toBe(false);
      wrapper.unmount();
    });
  });
  describe('invite link', () => {
    it('copies without revealing the invite token in toast feedback', async () => {
      mockSystemState.pvp_team_id = 'team-123';
      mockTeamState.id = 'team-123';
      mockTeamState.joinCode = 'private-code';
      const wrapper = await mountMyTeam();
      await wrapper.find('[data-testid="copy-team-invite"]').trigger('click');
      await flushPromises();
      expect(mockCopyToClipboard).toHaveBeenCalledWith(
        expect.stringContaining('code=private-code'),
        expect.objectContaining({ revealValue: false, shouldNotify: expect.any(Function) })
      );
      wrapper.unmount();
    });
  });
  describe('team name generation', () => {
    it('calls createTeam with display name and random suffix', async () => {
      setupMembershipQueries('team-123');
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
      mockEdgeFunctions.createTeam.mockResolvedValue({
        team: { id: 'team-123', ownerId: mockSupabaseUser.id, joinCode: 'JOIN1' },
      } as CreateTeamResponse);
      const wrapper = await mountMyTeam();
      const createButton = wrapper
        .findAll('button')
        .find((button) => button.text().includes('page.team.card.myteam.create_new_team'));
      expect(createButton).toBeTruthy();
      await createButton!.trigger('click');
      await flushPromises();
      expect(mockEdgeFunctions.createTeam).toHaveBeenCalledWith(
        'TestPMC-AAAA',
        'AAAAAAAAAAAA',
        5,
        'pvp'
      );
      expect(mockTeamState.owner).toBe(mockSupabaseUser.id);
      expect(mockTeamState.id).toBe('team-123');
      expect(mockTeamState.joinCode).toBe('JOIN1');
      expect(mockTeamState.owner_id).toBeNull();
      expect(mockTeamState.join_code).toBeNull();
      randomSpy.mockRestore();
      wrapper.unmount();
    });
  });
  describe('loading state management', () => {
    it('marks create button as loading while creating team', async () => {
      setupMembershipQueries('team-123');
      let resolveCreate!: (value: CreateTeamResponse) => void;
      const createPromise = new Promise<CreateTeamResponse>((resolve) => {
        resolveCreate = resolve;
      });
      mockEdgeFunctions.createTeam.mockReturnValue(createPromise);
      const wrapper = await mountMyTeam();
      const createButton = wrapper
        .findAll('button')
        .find((button) => button.text().includes('page.team.card.myteam.create_new_team'));
      await createButton!.trigger('click');
      await nextTick();
      const loadingButton = wrapper
        .findAll('button')
        .find((button) => button.text().includes('page.team.card.myteam.create_new_team'));
      expect(loadingButton?.attributes('data-loading')).toBe('true');
      resolveCreate!({
        team: { id: 'team-123', ownerId: mockSupabaseUser.id, joinCode: 'JOIN1' },
      } as CreateTeamResponse);
      await flushPromises();
      wrapper.unmount();
    });
  });
});
