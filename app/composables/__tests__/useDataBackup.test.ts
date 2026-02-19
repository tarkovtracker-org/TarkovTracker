import { beforeEach, describe, expect, it, vi } from 'vitest';
const mockLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};
const tarkovStore = {
  getCurrentGameMode: vi.fn(() => 'pvp'),
  getGameEdition: vi.fn(() => 1),
  getTarkovUid: vi.fn(() => null),
  getPvPProgressData: vi.fn(() => ({
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
    skillOffsets: {},
    storyChapters: {},
  })),
  getPvEProgressData: vi.fn(() => ({
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
  })),
  $patch: vi.fn(),
};
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => tarkovStore,
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
const loadComposable = async () => {
  const mod = await import('@/composables/useDataBackup');
  return mod.useDataBackup();
};
describe('useDataBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
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
        pvp: { level: 1 },
        pve: { level: 1 },
        gameEdition: 1,
        tarkovUid: null,
      };
      patchFn(mockState);
      expect(mockState.pvp.level).toBe(10);
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
        pvp: { level: 1 },
        pve: { level: 1 },
        gameEdition: 1,
        tarkovUid: null,
      };
      patchFn(mockState);
      expect(mockState.pvp.level).toBe(1);
      expect(mockState.pve.level).toBe(5);
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
        pvp: { level: 1 },
        pve: { level: 1 },
        gameEdition: 1,
        tarkovUid: null,
      };
      patchFn(mockState);
      expect(mockState.pvp.level).toBe(10);
      expect(mockState.pve.level).toBe(5);
      expect(mockState.gameEdition).toBe(3);
      expect(mockState.tarkovUid).toBe(12345);
      expect(mockState.currentGameMode).toBe('pve');
    });
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
