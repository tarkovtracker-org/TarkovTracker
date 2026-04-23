import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import type { UserProgressData, UserState } from '@/stores/progressState';
const { mockLogger, preferencesStore, supabaseUser } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  preferencesStore: {
    $state: {
      taskFilterPresets: [
        {
          id: 'preset-1',
          name: 'Sensitive Preset',
          settings: {
            taskUserView: 'teammate-3',
          },
        },
      ],
      taskUserView: 'teammate-2',
      teamHide: {
        'teammate-1': true,
      },
    } as Record<string, unknown>,
  },
  supabaseUser: {
    createdAt: '2025-01-01T00:00:00.000Z',
    email: 'player@example.com',
    id: 'user-123',
    lastLoginAt: '2025-02-01T00:00:00.000Z',
    loggedIn: true,
    provider: 'discord',
    providers: ['discord'],
  },
}));
const tarkovStore = {
  $state: {
    currentGameMode: 'pvp',
    gameEdition: 1,
    pvp: {
      displayName: 'CurrentUser',
      hideoutModules: {},
      hideoutParts: {},
      pmcFaction: 'USEC',
      prestigeLevel: 1,
      progressEpoch: 4,
      skillOffsets: {},
      skills: { Endurance: 10 },
      storyChapters: {},
      taskCompletions: { task1: { complete: true, timestamp: 1000 } },
      taskObjectives: {},
      traders: {},
      xpOffset: 0,
      level: 5,
    },
    pve: {
      displayName: null,
      hideoutModules: {},
      hideoutParts: {},
      pmcFaction: 'BEAR',
      prestigeLevel: 0,
      progressEpoch: 0,
      skillOffsets: {},
      skills: {},
      storyChapters: {},
      taskCompletions: {},
      taskObjectives: {},
      traders: {},
      xpOffset: 0,
      level: 1,
    },
    tarkovUid: 987654,
  } as UserState,
  getCurrentGameMode: vi.fn(() => 'pvp'),
  getGameEdition: vi.fn(() => 1),
  getTarkovUid: vi.fn(() => null),
  getPvPProgressData: vi.fn<() => UserProgressData>(() => ({
    level: 5,
    pmcFaction: 'USEC',
    displayName: 'TestPlayer',
    xpOffset: 0,
    taskCompletions: { task1: { complete: true, timestamp: 1000 } },
    taskObjectives: {},
    hideoutParts: {},
    hideoutModules: {},
    traders: {},
    skills: { Endurance: 10 },
    prestigeLevel: 1,
    progressEpoch: 4,
    skillOffsets: {},
    storyChapters: {},
  })),
  getPvEProgressData: vi.fn<() => UserProgressData>(() => ({
    level: 1,
    pmcFaction: 'BEAR',
    displayName: null,
    xpOffset: 0,
    taskCompletions: {},
    taskObjectives: {},
    hideoutParts: {},
    hideoutModules: {},
    traders: {},
    skills: {},
    prestigeLevel: 0,
    progressEpoch: 0,
    skillOffsets: {},
    storyChapters: {},
  })),
  $patch: vi.fn(),
};
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => tarkovStore,
}));
vi.mock('@/stores/usePreferences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/usePreferences')>();
  return {
    ...actual,
    usePreferencesStore: () => preferencesStore,
  };
});
vi.mock('@/composables/useAnalyticsConsent', () => ({
  useAnalyticsConsent: () => ({
    state: {
      __v_isRef: true as const,
      value: {
        status: 'accepted',
        updatedAt: '2025-03-01T00:00:00.000Z',
      },
    },
  }),
}));
vi.mock('@/utils/logger', () => ({
  logger: mockLogger,
}));
vi.stubGlobal('useRuntimeConfig', () => ({
  public: { appVersion: '1.8.2' },
}));
const createFile = (text: string): File =>
  ({
    text: vi.fn().mockResolvedValue(text),
  }) as unknown as File;
type DebugExportTestJson = {
  _format: string;
  auth: {
    hasAuthSessionHint: boolean;
  };
  runtime: {
    hash: string;
    path: string;
    query: string;
  };
  state: {
    preferences: {
      taskFilterPresets: Array<{
        name: string;
        settings: {
          taskUserView: string | null;
        };
      }>;
      taskUserView: string | null;
      teamHide: Record<string, boolean>;
    };
    tarkov: {
      pvp: {
        displayName: string | null;
      };
      tarkovUid: number | null;
    };
  };
  storage: {
    authStorageKeyCount: number;
    localStorageKeys: string[];
    preferences: {
      data: unknown | null;
      format: string;
      ownerMatchesCurrentUser: boolean | null;
      ownerUserFingerprint: string | null;
    } | null;
    progress: {
      data: unknown | null;
      format: string;
      ownerMatchesCurrentUser: boolean | null;
      ownerUserFingerprint: string | null;
    } | null;
    progressBackups: Array<{
      storageKey: string;
    }>;
  };
};
const loadComposable = async () => {
  const mod = await import('@/composables/useDataBackup');
  return mod.useDataBackup();
};
describe('useDataBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    const useNuxtAppStub = () => ({
      $supabase: {
        user: supabaseUser,
      },
    });
    vi.stubGlobal('useNuxtApp', useNuxtAppStub);
    Object.assign(globalThis, { useNuxtApp: useNuxtAppStub });
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    tarkovStore.$state = {
      currentGameMode: 'pvp',
      gameEdition: 1,
      pvp: {
        displayName: 'CurrentUser',
        hideoutModules: {},
        hideoutParts: {},
        pmcFaction: 'USEC',
        prestigeLevel: 1,
        progressEpoch: 4,
        skillOffsets: {},
        skills: { Endurance: 10 },
        storyChapters: {},
        taskCompletions: { task1: { complete: true, timestamp: 1000 } },
        taskObjectives: {},
        traders: {},
        xpOffset: 0,
        level: 5,
      },
      pve: {
        displayName: null,
        hideoutModules: {},
        hideoutParts: {},
        pmcFaction: 'BEAR',
        prestigeLevel: 0,
        progressEpoch: 0,
        skillOffsets: {},
        skills: {},
        storyChapters: {},
        taskCompletions: {},
        taskObjectives: {},
        traders: {},
        xpOffset: 0,
        level: 1,
      },
      tarkovUid: 987654,
    };
    preferencesStore.$state = {
      taskFilterPresets: [
        {
          id: 'preset-1',
          name: 'Sensitive Preset',
          settings: {
            taskUserView: 'teammate-3',
          },
        },
      ],
      taskUserView: 'teammate-2',
      teamHide: {
        'teammate-1': true,
      },
    };
    supabaseUser.createdAt = '2025-01-01T00:00:00.000Z';
    supabaseUser.email = 'player@example.com';
    supabaseUser.id = 'user-123';
    supabaseUser.lastLoginAt = '2025-02-01T00:00:00.000Z';
    supabaseUser.loggedIn = true;
    supabaseUser.provider = 'discord';
    supabaseUser.providers = ['discord'];
  });
  describe('exportProgress', () => {
    it('creates backup JSON with expected app and progress data', async () => {
      let backupBlob: Blob | null = null;
      const hadCreateObjectURL = typeof URL.createObjectURL === 'function';
      const hadRevokeObjectURL = typeof URL.revokeObjectURL === 'function';
      if (!hadCreateObjectURL) {
        Object.defineProperty(URL, 'createObjectURL', {
          configurable: true,
          value: () => '',
          writable: true,
        });
      }
      if (!hadRevokeObjectURL) {
        Object.defineProperty(URL, 'revokeObjectURL', {
          configurable: true,
          value: () => undefined,
          writable: true,
        });
      }
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
        if (object instanceof Blob) {
          backupBlob = object;
        }
        return 'blob:test-backup-url';
      });
      const revokeObjectURLSpy = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => undefined);
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
      try {
        const { exportProgress, exportError } = await loadComposable();
        await exportProgress();
        expect(exportError.value).toBeNull();
        expect(tarkovStore.getPvPProgressData).toHaveBeenCalledOnce();
        expect(tarkovStore.getPvEProgressData).toHaveBeenCalledOnce();
        expect(createObjectURLSpy).toHaveBeenCalledOnce();
        expect(createObjectURLSpy).toHaveBeenCalledWith(expect.any(Blob));
        expect(backupBlob).toBeInstanceOf(Blob);
        const backupText = await backupBlob!.text();
        const backupJson = JSON.parse(backupText) as Record<string, unknown>;
        expect(backupJson).toEqual(
          expect.objectContaining({
            _format: 'tarkovtracker-backup',
            _version: 1,
            currentGameMode: 'pvp',
            gameEdition: 1,
            tarkovUid: null,
            pvp: expect.objectContaining({
              displayName: 'TestPlayer',
              level: 5,
              pmcFaction: 'USEC',
              skills: { Endurance: 10 },
            }),
            pve: expect.objectContaining({
              displayName: null,
              level: 1,
              pmcFaction: 'BEAR',
            }),
          })
        );
        expect(backupJson.appVersion).toEqual(expect.any(String));
        expect(backupJson.exportedAt).toEqual(expect.any(Number));
        expect(revokeObjectURLSpy).toHaveBeenCalledOnce();
        expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-backup-url');
        expect(clickSpy).toHaveBeenCalledOnce();
      } finally {
        createObjectURLSpy.mockRestore();
        revokeObjectURLSpy.mockRestore();
        clickSpy.mockRestore();
        if (!hadCreateObjectURL) {
          delete (URL as unknown as Record<string, unknown>).createObjectURL;
        }
        if (!hadRevokeObjectURL) {
          delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
        }
      }
    });
    it('exports safely when progress data contains proxy-backed nested objects', async () => {
      const proxySkills = new Proxy({ Endurance: 10 }, {});
      tarkovStore.getPvPProgressData.mockReturnValueOnce(
        reactive({
          level: 5,
          pmcFaction: 'USEC',
          displayName: 'ProxyPlayer',
          xpOffset: 0,
          taskCompletions: { task1: { complete: true, timestamp: 1000 } },
          taskObjectives: {},
          hideoutParts: {},
          hideoutModules: {},
          traders: {},
          skills: proxySkills,
          prestigeLevel: 1,
          progressEpoch: 4,
          skillOffsets: {},
          storyChapters: {},
        })
      );
      const hadCreateObjectURL = typeof URL.createObjectURL === 'function';
      const hadRevokeObjectURL = typeof URL.revokeObjectURL === 'function';
      if (!hadCreateObjectURL) {
        Object.defineProperty(URL, 'createObjectURL', {
          configurable: true,
          value: () => '',
          writable: true,
        });
      }
      if (!hadRevokeObjectURL) {
        Object.defineProperty(URL, 'revokeObjectURL', {
          configurable: true,
          value: () => undefined,
          writable: true,
        });
      }
      let backupBlob: Blob | null = null;
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
        if (object instanceof Blob) {
          backupBlob = object;
        }
        return 'blob:test-backup-url';
      });
      const revokeObjectURLSpy = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => undefined);
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
      try {
        const { exportProgress, exportError } = await loadComposable();
        await expect(exportProgress()).resolves.toBeUndefined();
        expect(exportError.value).toBeNull();
        expect(backupBlob).toBeInstanceOf(Blob);
        const backupJson = JSON.parse(await backupBlob!.text()) as Record<string, unknown>;
        expect(backupJson.pvp).toEqual(
          expect.objectContaining({
            displayName: 'ProxyPlayer',
            skills: { Endurance: 10 },
          })
        );
      } finally {
        createObjectURLSpy.mockRestore();
        revokeObjectURLSpy.mockRestore();
        clickSpy.mockRestore();
        if (!hadCreateObjectURL) {
          delete (URL as unknown as Record<string, unknown>).createObjectURL;
        }
        if (!hadRevokeObjectURL) {
          delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
        }
      }
    });
  });
  describe('exportDebugSnapshot', () => {
    it('exports a sanitized debug snapshot without auth secrets or player identifiers', async () => {
      localStorage.setItem(
        STORAGE_KEYS.progress,
        JSON.stringify({
          _timestamp: 1700000000000,
          _userId: 'user-123',
          data: tarkovStore.$state,
        })
      );
      localStorage.setItem(
        STORAGE_KEYS.preferences,
        JSON.stringify({
          _timestamp: 1700000005000,
          _userId: 'user-123',
          data: preferencesStore.$state,
        })
      );
      localStorage.setItem('sb-localhost-auth-token', 'token-secret');
      localStorage.setItem(`${STORAGE_KEYS.progressBackupPrefix}user-123_1700000009999`, 'backup');
      sessionStorage.setItem(STORAGE_KEYS.sessionDataMigrated, 'true');
      window.history.replaceState({}, '', '/settings?tab=data#debug');
      let backupBlob: Blob | null = null;
      const hadCreateObjectURL = typeof URL.createObjectURL === 'function';
      const hadRevokeObjectURL = typeof URL.revokeObjectURL === 'function';
      if (!hadCreateObjectURL) {
        Object.defineProperty(URL, 'createObjectURL', {
          configurable: true,
          value: () => '',
          writable: true,
        });
      }
      if (!hadRevokeObjectURL) {
        Object.defineProperty(URL, 'revokeObjectURL', {
          configurable: true,
          value: () => undefined,
          writable: true,
        });
      }
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
        if (object instanceof Blob) {
          backupBlob = object;
        }
        return 'blob:test-debug-url';
      });
      const revokeObjectURLSpy = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => undefined);
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
      try {
        const { exportDebugSnapshot, debugExportError } = await loadComposable();
        await expect(exportDebugSnapshot()).resolves.toBeUndefined();
        expect(debugExportError.value).toBeNull();
        expect(backupBlob).toBeInstanceOf(Blob);
        const debugText = await backupBlob!.text();
        const debugJson = JSON.parse(debugText) as DebugExportTestJson;
        expect(debugJson._format).toBe('tarkovtracker-debug-export');
        expect(debugJson.auth).toEqual(
          expect.objectContaining({
            hasAuthSessionHint: true,
          })
        );
        expect(debugJson.runtime).toEqual(
          expect.objectContaining({
            path: '/settings',
            query: '?tab=data',
            hash: '#debug',
          })
        );
        expect(debugJson.state.tarkov.tarkovUid).toBeNull();
        expect(debugJson.state.tarkov.pvp.displayName).toBeNull();
        expect(debugJson.state.preferences.taskUserView).toMatch(/^user:(sha256|fnv1a):/);
        const [teamHideKey] = Object.keys(debugJson.state.preferences.teamHide);
        expect(teamHideKey).toBeDefined();
        expect(debugJson.state.preferences.teamHide).toEqual({
          [teamHideKey!]: true,
        });
        expect(teamHideKey).toMatch(/^user:(sha256|fnv1a):/);
        expect(debugJson.state.preferences.taskFilterPresets[0]).toEqual(
          expect.objectContaining({
            name: 'Preset 1',
            settings: expect.objectContaining({
              taskUserView: expect.stringMatching(/^user:(sha256|fnv1a):/),
            }),
          })
        );
        expect(debugJson.storage.authStorageKeyCount).toBe(1);
        expect(debugJson.storage.localStorageKeys).not.toContain('sb-localhost-auth-token');
        const progressSnapshot = debugJson.storage.progress;
        expect(progressSnapshot).not.toBeNull();
        if (!progressSnapshot) {
          throw new Error('Expected progress snapshot to be present');
        }
        expect(typeof progressSnapshot.ownerMatchesCurrentUser).toBe('boolean');
        expect(progressSnapshot.ownerUserFingerprint).toMatch(/^(sha256|fnv1a):/);
        expect(debugJson.storage.progressBackups).toHaveLength(1);
        expect(debugJson.storage.progressBackups[0]).toBeDefined();
        expect(debugJson.storage.progressBackups[0]!.storageKey).toContain('{owner:');
        expect(debugText).not.toContain('player@example.com');
        expect(debugText).not.toContain('token-secret');
        expect(debugText).not.toContain('user-123');
        expect(debugText).not.toContain('teammate-1');
        expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-debug-url');
        expect(clickSpy).toHaveBeenCalledOnce();
      } finally {
        createObjectURLSpy.mockRestore();
        revokeObjectURLSpy.mockRestore();
        clickSpy.mockRestore();
        if (!hadCreateObjectURL) {
          delete (URL as unknown as Record<string, unknown>).createObjectURL;
        }
        if (!hadRevokeObjectURL) {
          delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
        }
      }
    });
    it('exports debug snapshots even when persisted presets are malformed', async () => {
      preferencesStore.$state = {
        taskFilterPresets: [
          {
            id: 'preset-1',
            name: 'Broken Preset',
            settings: null,
          },
          'invalid-preset-entry',
        ],
        taskUserView: 'teammate-2',
        teamHide: {
          'teammate-1': true,
        },
      };
      localStorage.setItem(
        STORAGE_KEYS.preferences,
        JSON.stringify({
          _timestamp: 1700000005000,
          _userId: 'user-123',
          data: preferencesStore.$state,
        })
      );
      let backupBlob: Blob | null = null;
      const hadCreateObjectURL = typeof URL.createObjectURL === 'function';
      const hadRevokeObjectURL = typeof URL.revokeObjectURL === 'function';
      if (!hadCreateObjectURL) {
        Object.defineProperty(URL, 'createObjectURL', {
          configurable: true,
          value: () => '',
          writable: true,
        });
      }
      if (!hadRevokeObjectURL) {
        Object.defineProperty(URL, 'revokeObjectURL', {
          configurable: true,
          value: () => undefined,
          writable: true,
        });
      }
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
        if (object instanceof Blob) {
          backupBlob = object;
        }
        return 'blob:test-malformed-preset-url';
      });
      const revokeObjectURLSpy = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => undefined);
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
      try {
        const { exportDebugSnapshot, debugExportError } = await loadComposable();
        await expect(exportDebugSnapshot()).resolves.toBeUndefined();
        expect(debugExportError.value).toBeNull();
        expect(backupBlob).toBeInstanceOf(Blob);
        const debugJson = JSON.parse(await backupBlob!.text()) as DebugExportTestJson;
        expect(debugJson.state.preferences.taskFilterPresets).toEqual([
          expect.objectContaining({
            id: 'preset-1',
            name: 'Preset 1',
            settings: expect.objectContaining({
              taskUserView: null,
            }),
          }),
          expect.objectContaining({
            id: 'preset-2',
            name: 'Preset 2',
            settings: expect.objectContaining({
              taskUserView: null,
            }),
          }),
        ]);
        expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-malformed-preset-url');
        expect(clickSpy).toHaveBeenCalledOnce();
      } finally {
        createObjectURLSpy.mockRestore();
        revokeObjectURLSpy.mockRestore();
        clickSpy.mockRestore();
        if (!hadCreateObjectURL) {
          delete (URL as unknown as Record<string, unknown>).createObjectURL;
        }
        if (!hadRevokeObjectURL) {
          delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
        }
      }
    });
    it('exports debug snapshots with an empty preset list when persisted presets are not an array', async () => {
      preferencesStore.$state = {
        taskFilterPresets: 'invalid-preset-container',
        taskUserView: 'teammate-2',
        teamHide: {
          'teammate-1': true,
        },
      };
      localStorage.setItem(
        STORAGE_KEYS.preferences,
        JSON.stringify({
          _timestamp: 1700000005000,
          _userId: 'user-123',
          data: preferencesStore.$state,
        })
      );
      let backupBlob: Blob | null = null;
      const hadCreateObjectURL = typeof URL.createObjectURL === 'function';
      const hadRevokeObjectURL = typeof URL.revokeObjectURL === 'function';
      if (!hadCreateObjectURL) {
        Object.defineProperty(URL, 'createObjectURL', {
          configurable: true,
          value: () => '',
          writable: true,
        });
      }
      if (!hadRevokeObjectURL) {
        Object.defineProperty(URL, 'revokeObjectURL', {
          configurable: true,
          value: () => undefined,
          writable: true,
        });
      }
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
        if (object instanceof Blob) {
          backupBlob = object;
        }
        return 'blob:test-invalid-preset-container-url';
      });
      const revokeObjectURLSpy = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => undefined);
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
      try {
        const { exportDebugSnapshot, debugExportError } = await loadComposable();
        await expect(exportDebugSnapshot()).resolves.toBeUndefined();
        expect(debugExportError.value).toBeNull();
        expect(backupBlob).toBeInstanceOf(Blob);
        const debugJson = JSON.parse(await backupBlob!.text()) as DebugExportTestJson;
        expect(debugJson.state.preferences.taskFilterPresets).toEqual([]);
        expect(debugJson.storage.preferences).toEqual(
          expect.objectContaining({
            data: expect.objectContaining({
              taskFilterPresets: [],
            }),
          })
        );
        expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-invalid-preset-container-url');
        expect(clickSpy).toHaveBeenCalledOnce();
      } finally {
        createObjectURLSpy.mockRestore();
        revokeObjectURLSpy.mockRestore();
        clickSpy.mockRestore();
        if (!hadCreateObjectURL) {
          delete (URL as unknown as Record<string, unknown>).createObjectURL;
        }
        if (!hadRevokeObjectURL) {
          delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
        }
      }
    });
    it('exports legacy progress storage without crashing on pre-gamemode data', async () => {
      localStorage.setItem(
        STORAGE_KEYS.progress,
        JSON.stringify({
          displayName: 'Legacy Raider',
          gameEdition: 3,
          hideoutModules: {},
          hideoutParts: {},
          level: 14,
          pmcFaction: 'USEC',
          prestigeLevel: 2,
          progressEpoch: 7,
          skillOffsets: {},
          skills: { Endurance: 12 },
          storyChapters: {},
          taskCompletions: { task1: { complete: true, timestamp: 1000 } },
          taskObjectives: {},
          tarkovUid: 998877,
          traders: {},
          xpOffset: 0,
        })
      );
      let backupBlob: Blob | null = null;
      const hadCreateObjectURL = typeof URL.createObjectURL === 'function';
      const hadRevokeObjectURL = typeof URL.revokeObjectURL === 'function';
      if (!hadCreateObjectURL) {
        Object.defineProperty(URL, 'createObjectURL', {
          configurable: true,
          value: () => '',
          writable: true,
        });
      }
      if (!hadRevokeObjectURL) {
        Object.defineProperty(URL, 'revokeObjectURL', {
          configurable: true,
          value: () => undefined,
          writable: true,
        });
      }
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
        if (object instanceof Blob) {
          backupBlob = object;
        }
        return 'blob:test-legacy-debug-url';
      });
      const revokeObjectURLSpy = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => undefined);
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
      try {
        const { exportDebugSnapshot, debugExportError } = await loadComposable();
        await expect(exportDebugSnapshot()).resolves.toBeUndefined();
        expect(debugExportError.value).toBeNull();
        expect(backupBlob).toBeInstanceOf(Blob);
        const debugText = await backupBlob!.text();
        const debugJson = JSON.parse(debugText) as DebugExportTestJson & {
          storage: DebugExportTestJson['storage'] & {
            progress: {
              data: {
                currentGameMode: string;
                gameEdition: number;
                pvp: {
                  displayName: string | null;
                  level: number;
                  prestigeLevel: number;
                };
              };
              format: string;
            };
          };
        };
        expect(debugJson.storage.progress.format).toBe('legacy');
        expect(debugJson.storage.progress.data.currentGameMode).toBe('pvp');
        expect(debugJson.storage.progress.data.gameEdition).toBe(3);
        expect(debugJson.storage.progress.data.pvp.level).toBe(14);
        expect(debugJson.storage.progress.data.pvp.prestigeLevel).toBe(2);
        expect(debugJson.storage.progress.data.pvp.displayName).toBeNull();
        expect(debugText).not.toContain('Legacy Raider');
        expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-legacy-debug-url');
        expect(clickSpy).toHaveBeenCalledOnce();
      } finally {
        createObjectURLSpy.mockRestore();
        revokeObjectURLSpy.mockRestore();
        clickSpy.mockRestore();
        if (!hadCreateObjectURL) {
          delete (URL as unknown as Record<string, unknown>).createObjectURL;
        }
        if (!hadRevokeObjectURL) {
          delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
        }
      }
    });
    it('marks JSON-valid but invalid persisted storage payloads as unparseable', async () => {
      localStorage.setItem(STORAGE_KEYS.progress, '123');
      localStorage.setItem(STORAGE_KEYS.preferences, '[]');
      let backupBlob: Blob | null = null;
      const hadCreateObjectURL = typeof URL.createObjectURL === 'function';
      const hadRevokeObjectURL = typeof URL.revokeObjectURL === 'function';
      if (!hadCreateObjectURL) {
        Object.defineProperty(URL, 'createObjectURL', {
          configurable: true,
          value: () => '',
          writable: true,
        });
      }
      if (!hadRevokeObjectURL) {
        Object.defineProperty(URL, 'revokeObjectURL', {
          configurable: true,
          value: () => undefined,
          writable: true,
        });
      }
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
        if (object instanceof Blob) {
          backupBlob = object;
        }
        return 'blob:test-invalid-storage-url';
      });
      const revokeObjectURLSpy = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => undefined);
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
      try {
        const { exportDebugSnapshot, debugExportError } = await loadComposable();
        await expect(exportDebugSnapshot()).resolves.toBeUndefined();
        expect(debugExportError.value).toBeNull();
        expect(backupBlob).toBeInstanceOf(Blob);
        const debugJson = JSON.parse(await backupBlob!.text()) as DebugExportTestJson;
        expect(debugJson.storage.progress).toEqual(
          expect.objectContaining({
            data: null,
            format: 'unparseable',
            ownerMatchesCurrentUser: null,
            ownerUserFingerprint: null,
          })
        );
        expect(debugJson.storage.preferences).toEqual(
          expect.objectContaining({
            data: null,
            format: 'unparseable',
            ownerMatchesCurrentUser: null,
            ownerUserFingerprint: null,
          })
        );
        expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-invalid-storage-url');
        expect(clickSpy).toHaveBeenCalledOnce();
      } finally {
        createObjectURLSpy.mockRestore();
        revokeObjectURLSpy.mockRestore();
        clickSpy.mockRestore();
        if (!hadCreateObjectURL) {
          delete (URL as unknown as Record<string, unknown>).createObjectURL;
        }
        if (!hadRevokeObjectURL) {
          delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
        }
      }
    });
  });
  describe('parseBackupFile', () => {
    it('rejects non-JSON files', async () => {
      const { parseBackupFile, importState, importError } = await loadComposable();
      await parseBackupFile(createFile('not json'));
      expect(importState.value).toBe('error');
      expect(importError.value).toBeTruthy();
    });
    it('rejects JSON without _format field', async () => {
      const { parseBackupFile, importState, importError } = await loadComposable();
      await parseBackupFile(createFile(JSON.stringify({ foo: 'bar' })));
      expect(importState.value).toBe('error');
      expect(importError.value).toContain('format');
    });
    it('rejects wrong _format value', async () => {
      const { parseBackupFile, importState, importError } = await loadComposable();
      await parseBackupFile(createFile(JSON.stringify({ _format: 'wrong', _version: 1 })));
      expect(importState.value).toBe('error');
      expect(importError.value).toContain('format');
    });
    it('rejects unsupported _version', async () => {
      const { parseBackupFile, importState, importError } = await loadComposable();
      await parseBackupFile(
        createFile(JSON.stringify({ _format: 'tarkovtracker-backup', _version: 999 }))
      );
      expect(importState.value).toBe('error');
      expect(importError.value).toContain('version');
    });
    it('rejects missing pvp/pve data', async () => {
      const { parseBackupFile, importState, importError } = await loadComposable();
      await parseBackupFile(
        createFile(
          JSON.stringify({
            _format: 'tarkovtracker-backup',
            _version: 1,
            currentGameMode: 'pvp',
            gameEdition: 1,
            tarkovUid: null,
          })
        )
      );
      expect(importState.value).toBe('error');
      expect(importError.value).toBeTruthy();
    });
    it('rejects invalid faction', async () => {
      const { parseBackupFile, importState, importError } = await loadComposable();
      await parseBackupFile(
        createFile(
          JSON.stringify({
            _format: 'tarkovtracker-backup',
            _version: 1,
            currentGameMode: 'pvp',
            gameEdition: 1,
            tarkovUid: null,
            pvp: {
              level: 1,
              pmcFaction: 'INVALID',
              displayName: null,
              xpOffset: 0,
              taskCompletions: {},
              taskObjectives: {},
              hideoutParts: {},
              hideoutModules: {},
              traders: {},
              skills: {},
              prestigeLevel: 0,
              skillOffsets: {},
              storyChapters: {},
            },
            pve: {
              level: 1,
              pmcFaction: 'USEC',
              displayName: null,
              xpOffset: 0,
              taskCompletions: {},
              taskObjectives: {},
              hideoutParts: {},
              hideoutModules: {},
              traders: {},
              skills: {},
              prestigeLevel: 0,
              skillOffsets: {},
              storyChapters: {},
            },
          })
        )
      );
      expect(importState.value).toBe('error');
      expect(importError.value).toContain('faction');
    });
    it('accepts valid backup and enters preview state', async () => {
      const validBackup = {
        _format: 'tarkovtracker-backup',
        _version: 1,
        exportedAt: Date.now(),
        appVersion: '1.8.2',
        currentGameMode: 'pvp',
        gameEdition: 3,
        tarkovUid: null,
        pvp: {
          level: 10,
          pmcFaction: 'USEC',
          displayName: 'Player',
          xpOffset: 100,
          taskCompletions: { task1: { complete: true, timestamp: 1000 } },
          taskObjectives: {},
          hideoutParts: {},
          hideoutModules: {},
          traders: {},
          skills: { Endurance: 15 },
          prestigeLevel: 2,
          skillOffsets: {},
          storyChapters: {},
        },
        pve: {
          level: 1,
          pmcFaction: 'BEAR',
          displayName: null,
          xpOffset: 0,
          taskCompletions: {},
          taskObjectives: {},
          hideoutParts: {},
          hideoutModules: {},
          traders: {},
          skills: {},
          prestigeLevel: 0,
          skillOffsets: {},
          storyChapters: {},
        },
      };
      const { parseBackupFile, importState, importPreview } = await loadComposable();
      await parseBackupFile(createFile(JSON.stringify(validBackup)));
      expect(importState.value).toBe('preview');
      expect(importPreview.value).not.toBeNull();
      expect(importPreview.value!.pvp.level).toBe(10);
      expect(importPreview.value!.pvp.faction).toBe('USEC');
      expect(importPreview.value!.pvp.taskCount).toBe(1);
      expect(importPreview.value!.pve.level).toBe(1);
      expect(importPreview.value!.gameEdition).toBe(3);
    });
    it('clamps out-of-range values during sanitization', async () => {
      const backup = {
        _format: 'tarkovtracker-backup',
        _version: 1,
        exportedAt: Date.now(),
        appVersion: '1.8.2',
        currentGameMode: 'pvp',
        gameEdition: 3,
        tarkovUid: null,
        pvp: {
          level: -5,
          pmcFaction: 'USEC',
          displayName: null,
          xpOffset: 0,
          taskCompletions: {},
          taskObjectives: {},
          hideoutParts: {},
          hideoutModules: {},
          traders: {},
          skills: { Endurance: 999 },
          prestigeLevel: 99,
          skillOffsets: {},
          storyChapters: {},
        },
        pve: {
          level: 1,
          pmcFaction: 'BEAR',
          displayName: null,
          xpOffset: 0,
          taskCompletions: {},
          taskObjectives: {},
          hideoutParts: {},
          hideoutModules: {},
          traders: {},
          skills: {},
          prestigeLevel: 0,
          skillOffsets: {},
          storyChapters: {},
        },
      };
      const { parseBackupFile, confirmBackupImport, importPreview } = await loadComposable();
      await parseBackupFile(createFile(JSON.stringify(backup)));
      expect(importPreview.value!.pvp.level).toBe(1);
      expect(importPreview.value!.pvp.prestigeLevel).toBe(6);
      await confirmBackupImport({ pvp: true, pve: false });
      const patchFn = tarkovStore.$patch.mock.calls[0]![0] as (
        state: Record<string, unknown>
      ) => void;
      const mockState = {
        currentGameMode: 'pve',
        pvp: { level: 1, skills: {} },
        pve: { level: 1 },
        gameEdition: 1,
        tarkovUid: null,
      };
      patchFn(mockState);
      expect((mockState.pvp as Record<string, unknown>).skills).toEqual({ Endurance: 51 });
    });
    it('strips unknown keys from progress data', async () => {
      const backup = {
        _format: 'tarkovtracker-backup',
        _version: 1,
        exportedAt: Date.now(),
        appVersion: '1.8.2',
        currentGameMode: 'pvp',
        gameEdition: 1,
        tarkovUid: null,
        pvp: {
          level: 1,
          pmcFaction: 'USEC',
          displayName: null,
          xpOffset: 0,
          taskCompletions: {},
          taskObjectives: {},
          hideoutParts: {},
          hideoutModules: {},
          traders: {},
          skills: {},
          prestigeLevel: 0,
          skillOffsets: {},
          storyChapters: {},
          _maliciousField: 'should be stripped',
          lastApiUpdate: { id: 'x', at: 1, source: 'api' },
        },
        pve: {
          level: 1,
          pmcFaction: 'BEAR',
          displayName: null,
          xpOffset: 0,
          taskCompletions: {},
          taskObjectives: {},
          hideoutParts: {},
          hideoutModules: {},
          traders: {},
          skills: {},
          prestigeLevel: 0,
          skillOffsets: {},
          storyChapters: {},
        },
      };
      const { parseBackupFile, importState } = await loadComposable();
      await parseBackupFile(createFile(JSON.stringify(backup)));
      expect(importState.value).toBe('preview');
    });
  });
  describe('confirmBackupImport', () => {
    const validBackup = {
      _format: 'tarkovtracker-backup',
      _version: 1,
      exportedAt: Date.now(),
      appVersion: '1.8.2',
      currentGameMode: 'pve',
      gameEdition: 3,
      tarkovUid: 12345,
      pvp: {
        level: 10,
        pmcFaction: 'USEC',
        displayName: 'Player',
        xpOffset: 100,
        taskCompletions: { task1: { complete: true, timestamp: 1000 } },
        taskObjectives: {},
        hideoutParts: {},
        hideoutModules: {},
        traders: {},
        skills: {},
        prestigeLevel: 2,
        progressEpoch: 2,
        skillOffsets: {},
        storyChapters: {},
      },
      pve: {
        level: 5,
        pmcFaction: 'BEAR',
        displayName: 'PvePlayer',
        xpOffset: 50,
        taskCompletions: { task2: { complete: true, timestamp: 2000 } },
        taskObjectives: {},
        hideoutParts: {},
        hideoutModules: {},
        traders: {},
        skills: {},
        prestigeLevel: 0,
        progressEpoch: 1,
        skillOffsets: {},
        storyChapters: {},
      },
    };
    it('patches pvp data only when pvp selected', async () => {
      const { parseBackupFile, confirmBackupImport, importState } = await loadComposable();
      await parseBackupFile(createFile(JSON.stringify(validBackup)));
      await confirmBackupImport({ pvp: true, pve: false });
      expect(tarkovStore.$patch).toHaveBeenCalledOnce();
      expect(importState.value).toBe('success');
      const patchFn = tarkovStore.$patch.mock.calls[0]![0] as (
        state: Record<string, unknown>
      ) => void;
      const mockState = {
        currentGameMode: 'pve',
        pvp: { level: 1, progressEpoch: 5 },
        pve: { level: 1, progressEpoch: 3 },
        gameEdition: 1,
        tarkovUid: null,
      };
      patchFn(mockState);
      expect(mockState.pvp.level).toBe(10);
      expect(mockState.pvp.progressEpoch).toBe(6);
      expect(mockState.pve.level).toBe(1);
      expect(mockState.gameEdition).toBe(1);
      expect(mockState.tarkovUid).toBeNull();
      expect(mockState.currentGameMode).toBe('pvp');
    });
    it('patches pve data only when pve selected', async () => {
      const { parseBackupFile, confirmBackupImport } = await loadComposable();
      await parseBackupFile(createFile(JSON.stringify(validBackup)));
      await confirmBackupImport({ pvp: false, pve: true });
      const patchFn = tarkovStore.$patch.mock.calls[0]![0] as (
        state: Record<string, unknown>
      ) => void;
      const mockState = {
        currentGameMode: 'pvp',
        pvp: { level: 1, progressEpoch: 5 },
        pve: { level: 1, progressEpoch: 3 },
        gameEdition: 1,
        tarkovUid: null,
      };
      patchFn(mockState);
      expect(mockState.pvp.level).toBe(1);
      expect(mockState.pve.level).toBe(5);
      expect(mockState.pve.progressEpoch).toBe(4);
      expect(mockState.gameEdition).toBe(1);
      expect(mockState.tarkovUid).toBeNull();
      expect(mockState.currentGameMode).toBe('pve');
    });
    it('patches both modes when both selected', async () => {
      const { parseBackupFile, confirmBackupImport } = await loadComposable();
      await parseBackupFile(createFile(JSON.stringify(validBackup)));
      await confirmBackupImport({ pvp: true, pve: true });
      const patchFn = tarkovStore.$patch.mock.calls[0]![0] as (
        state: Record<string, unknown>
      ) => void;
      const mockState = {
        currentGameMode: 'pvp',
        pvp: { level: 1, progressEpoch: 5 },
        pve: { level: 1, progressEpoch: 7 },
        gameEdition: 1,
        tarkovUid: null,
      };
      patchFn(mockState);
      expect(mockState.pvp.level).toBe(10);
      expect(mockState.pve.level).toBe(5);
      expect(mockState.pvp.progressEpoch).toBe(6);
      expect(mockState.pve.progressEpoch).toBe(8);
      expect(mockState.gameEdition).toBe(3);
      expect(mockState.tarkovUid).toBe(12345);
      expect(mockState.currentGameMode).toBe('pve');
    });
    it.each(['pvp', 'pve'] as const)(
      'ignores legacy tarkovUidMode=%s metadata in backup payloads',
      async (legacyMode) => {
        const legacyBackup = {
          ...validBackup,
          tarkovUidMode: legacyMode,
        };
        const { parseBackupFile, confirmBackupImport } = await loadComposable();
        await parseBackupFile(createFile(JSON.stringify(legacyBackup)));
        await confirmBackupImport({ pvp: true, pve: true });
        const patchFn = tarkovStore.$patch.mock.calls[0]![0] as (
          state: Record<string, unknown>
        ) => void;
        const mockState = {
          currentGameMode: 'pvp',
          gameEdition: 1,
          pvp: { level: 1, progressEpoch: 5 },
          pve: { level: 1, progressEpoch: 7 },
          tarkovUid: null,
        };
        patchFn(mockState);
        expect(mockState.tarkovUid).toBe(12345);
        expect(mockState.currentGameMode).toBe('pve');
        expect(mockState).not.toHaveProperty('tarkovUidMode');
      }
    );
    it('does nothing when not in preview state', async () => {
      const { confirmBackupImport } = await loadComposable();
      await confirmBackupImport({ pvp: true, pve: true });
      expect(tarkovStore.$patch).not.toHaveBeenCalled();
    });
  });
  describe('resetImport', () => {
    it('resets state back to idle', async () => {
      const { parseBackupFile, resetImport, importState, importPreview, importError } =
        await loadComposable();
      const validBackup = {
        _format: 'tarkovtracker-backup',
        _version: 1,
        exportedAt: Date.now(),
        appVersion: '1.8.2',
        currentGameMode: 'pvp',
        gameEdition: 1,
        tarkovUid: null,
        pvp: {
          level: 1,
          pmcFaction: 'USEC',
          displayName: null,
          xpOffset: 0,
          taskCompletions: {},
          taskObjectives: {},
          hideoutParts: {},
          hideoutModules: {},
          traders: {},
          skills: {},
          prestigeLevel: 0,
          skillOffsets: {},
          storyChapters: {},
        },
        pve: {
          level: 1,
          pmcFaction: 'BEAR',
          displayName: null,
          xpOffset: 0,
          taskCompletions: {},
          taskObjectives: {},
          hideoutParts: {},
          hideoutModules: {},
          traders: {},
          skills: {},
          prestigeLevel: 0,
          skillOffsets: {},
          storyChapters: {},
        },
      };
      await parseBackupFile(createFile(JSON.stringify(validBackup)));
      expect(importState.value).toBe('preview');
      resetImport();
      expect(importState.value).toBe('idle');
      expect(importPreview.value).toBeNull();
      expect(importError.value).toBeNull();
    });
  });
});
