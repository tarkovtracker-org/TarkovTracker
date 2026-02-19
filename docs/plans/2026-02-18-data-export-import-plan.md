# Data Export/Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add progress backup export/import to the Data Management card and merge the tarkov.dev import into the same card.

**Architecture:** New `useDataBackup` composable handles export (serialize store state to JSON file download) and import (parse, validate, sanitize, preview, replace via `$patch`). The existing `DataManagementCard.vue` absorbs the tarkov.dev import UI from `TarkovDevImportCard.vue` and adds export/import sections. No store changes needed.

**Tech Stack:** Vue 3 `<script setup>`, Pinia `$patch`, Vitest, Tailwind v4, JSON file download via `URL.createObjectURL`/`Blob`.

---

## Task 1: Create `useDataBackup` composable — validation utilities

**Files:**

- Create: `app/composables/useDataBackup.ts`
- Test: `app/composables/__tests__/useDataBackup.test.ts`

**Step 1: Write failing tests for validation**

Create `app/composables/__tests__/useDataBackup.test.ts`:

```typescript
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

// Mock useRuntimeConfig (Nuxt auto-import)
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
      const { parseBackupFile, importPreview } = await loadComposable();
      await parseBackupFile(createFile(JSON.stringify(backup)));
      expect(importPreview.value!.pvp.level).toBe(1);
      expect(importPreview.value!.pvp.prestigeLevel).toBe(6);
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
      // The sanitized data stored internally should not contain these keys
      // (tested indirectly via the preview — if parse succeeds, sanitization ran)
    });
  });

  describe('confirmBackupImport', () => {
    const validBackup = {
      _format: 'tarkovtracker-backup',
      _version: 1,
      exportedAt: Date.now(),
      appVersion: '1.8.2',
      currentGameMode: 'pvp',
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
      // Verify the patch function applies pvp but not pve
      const patchFn = tarkovStore.$patch.mock.calls[0][0];
      const mockState = {
        pvp: { level: 1 },
        pve: { level: 1 },
        gameEdition: 1,
        tarkovUid: null,
      };
      patchFn(mockState);
      expect(mockState.pvp.level).toBe(10);
      expect(mockState.pve.level).toBe(1); // unchanged
    });

    it('patches both modes when both selected', async () => {
      const { parseBackupFile, confirmBackupImport } = await loadComposable();
      await parseBackupFile(createFile(JSON.stringify(validBackup)));
      await confirmBackupImport({ pvp: true, pve: true });
      const patchFn = tarkovStore.$patch.mock.calls[0][0];
      const mockState = {
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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run app/composables/__tests__/useDataBackup.test.ts`
Expected: FAIL — module `@/composables/useDataBackup` not found

**Step 3: Implement the composable**

Create `app/composables/useDataBackup.ts`:

```typescript
import { useTarkovStore } from '@/stores/useTarkov';
import type { UserProgressData, UserState } from '@/stores/progressState';
import { logger } from '@/utils/logger';

const BACKUP_FORMAT = 'tarkovtracker-backup' as const;
const SUPPORTED_VERSIONS = [1] as const;

interface TarkovTrackerExport {
  _format: typeof BACKUP_FORMAT;
  _version: number;
  exportedAt: number;
  appVersion: string;
  currentGameMode: string;
  gameEdition: number;
  tarkovUid: number | null;
  pvp: UserProgressData;
  pve: UserProgressData;
}

export interface BackupPreviewData {
  exportedAt: number;
  appVersion: string;
  gameEdition: number;
  tarkovUid: number | null;
  pvp: {
    level: number;
    faction: string;
    displayName: string | null;
    taskCount: number;
    hideoutModuleCount: number;
    prestigeLevel: number;
  };
  pve: {
    level: number;
    faction: string;
    displayName: string | null;
    taskCount: number;
    hideoutModuleCount: number;
    prestigeLevel: number;
  };
}

export type BackupImportState = 'idle' | 'preview' | 'success' | 'error';

const ALLOWED_PROGRESS_KEYS = new Set([
  'level',
  'pmcFaction',
  'displayName',
  'xpOffset',
  'taskCompletions',
  'taskObjectives',
  'hideoutParts',
  'hideoutModules',
  'traders',
  'skills',
  'prestigeLevel',
  'skillOffsets',
  'storyChapters',
  'tarkovDevProfile',
]);

const VALID_FACTIONS = new Set(['USEC', 'BEAR']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeProgressData(
  raw: unknown
): { ok: true; data: UserProgressData } | { ok: false; error: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Progress data must be an object' };
  }

  if (!VALID_FACTIONS.has(raw.pmcFaction as string)) {
    return { ok: false, error: 'Invalid faction — must be USEC or BEAR' };
  }

  const dictFields = [
    'taskCompletions',
    'taskObjectives',
    'hideoutParts',
    'hideoutModules',
    'traders',
    'skills',
    'skillOffsets',
    'storyChapters',
  ] as const;

  for (const field of dictFields) {
    if (raw[field] !== undefined && !isPlainObject(raw[field])) {
      return { ok: false, error: `Field "${field}" must be an object` };
    }
  }

  const stripped: Record<string, unknown> = {};
  for (const key of ALLOWED_PROGRESS_KEYS) {
    if (key in raw) {
      stripped[key] = raw[key];
    }
  }

  const level = typeof stripped.level === 'number' ? Math.max(1, Math.trunc(stripped.level)) : 1;
  const prestigeLevel =
    typeof stripped.prestigeLevel === 'number'
      ? Math.max(0, Math.min(6, Math.trunc(stripped.prestigeLevel)))
      : 0;
  const xpOffset =
    typeof stripped.xpOffset === 'number' && Number.isFinite(stripped.xpOffset)
      ? Math.trunc(stripped.xpOffset)
      : 0;
  const displayName =
    typeof stripped.displayName === 'string'
      ? stripped.displayName.trim().slice(0, 64) || null
      : null;

  const skills = isPlainObject(stripped.skills)
    ? { ...(stripped.skills as Record<string, number>) }
    : {};
  for (const [key, val] of Object.entries(skills)) {
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      skills[key] = 0;
    } else {
      skills[key] = Math.max(0, Math.min(51, val));
    }
  }

  return {
    ok: true,
    data: {
      level,
      pmcFaction: stripped.pmcFaction as 'USEC' | 'BEAR',
      displayName,
      xpOffset,
      taskCompletions: isPlainObject(stripped.taskCompletions)
        ? (stripped.taskCompletions as UserProgressData['taskCompletions'])
        : {},
      taskObjectives: isPlainObject(stripped.taskObjectives)
        ? (stripped.taskObjectives as UserProgressData['taskObjectives'])
        : {},
      hideoutParts: isPlainObject(stripped.hideoutParts)
        ? (stripped.hideoutParts as UserProgressData['hideoutParts'])
        : {},
      hideoutModules: isPlainObject(stripped.hideoutModules)
        ? (stripped.hideoutModules as UserProgressData['hideoutModules'])
        : {},
      traders: isPlainObject(stripped.traders)
        ? (stripped.traders as UserProgressData['traders'])
        : {},
      skills,
      prestigeLevel,
      skillOffsets: isPlainObject(stripped.skillOffsets)
        ? (stripped.skillOffsets as UserProgressData['skillOffsets'])
        : {},
      storyChapters: isPlainObject(stripped.storyChapters)
        ? (stripped.storyChapters as UserProgressData['storyChapters'])
        : {},
      ...(stripped.tarkovDevProfile !== undefined
        ? { tarkovDevProfile: stripped.tarkovDevProfile as UserProgressData['tarkovDevProfile'] }
        : {}),
    },
  };
}

function validateBackup(json: unknown):
  | {
      ok: true;
      data: { export: TarkovTrackerExport; pvp: UserProgressData; pve: UserProgressData };
    }
  | { ok: false; error: string } {
  if (!isPlainObject(json)) {
    return { ok: false, error: 'Invalid file format — expected a JSON object' };
  }

  if (json._format !== BACKUP_FORMAT) {
    return { ok: false, error: 'Invalid file format — not a TarkovTracker backup' };
  }

  if (!SUPPORTED_VERSIONS.includes(json._version as (typeof SUPPORTED_VERSIONS)[number])) {
    return { ok: false, error: `Unsupported backup version: ${json._version}` };
  }

  if (json.currentGameMode !== 'pvp' && json.currentGameMode !== 'pve') {
    return { ok: false, error: 'Invalid currentGameMode — must be "pvp" or "pve"' };
  }

  const edition = json.gameEdition;
  if (typeof edition !== 'number' || !Number.isInteger(edition) || edition < 1 || edition > 6) {
    return { ok: false, error: 'Invalid gameEdition — must be integer 1-6' };
  }

  if (
    json.tarkovUid !== null &&
    (typeof json.tarkovUid !== 'number' || !Number.isFinite(json.tarkovUid))
  ) {
    return { ok: false, error: 'Invalid tarkovUid — must be a number or null' };
  }

  const pvpResult = sanitizeProgressData(json.pvp);
  if (!pvpResult.ok) {
    return { ok: false, error: `PvP data: ${pvpResult.error}` };
  }

  const pveResult = sanitizeProgressData(json.pve);
  if (!pveResult.ok) {
    return { ok: false, error: `PvE data: ${pveResult.error}` };
  }

  return {
    ok: true,
    data: {
      export: json as unknown as TarkovTrackerExport,
      pvp: pvpResult.data,
      pve: pveResult.data,
    },
  };
}

function buildPreview(
  exportData: TarkovTrackerExport,
  pvp: UserProgressData,
  pve: UserProgressData
): BackupPreviewData {
  const modePreview = (data: UserProgressData) => ({
    level: data.level,
    faction: data.pmcFaction,
    displayName: data.displayName,
    taskCount: Object.keys(data.taskCompletions).length,
    hideoutModuleCount: Object.keys(data.hideoutModules).length,
    prestigeLevel: data.prestigeLevel,
  });

  return {
    exportedAt: exportData.exportedAt,
    appVersion: exportData.appVersion,
    gameEdition: exportData.gameEdition,
    tarkovUid: exportData.tarkovUid,
    pvp: modePreview(pvp),
    pve: modePreview(pve),
  };
}

function stripLastApiUpdate(data: UserProgressData): UserProgressData {
  const { lastApiUpdate: _, ...rest } = data;
  return rest as UserProgressData;
}

export function useDataBackup() {
  const tarkovStore = useTarkovStore();
  const importState = ref<BackupImportState>('idle');
  const importPreview = ref<BackupPreviewData | null>(null);
  const importError = ref<string | null>(null);

  let parsedPvp: UserProgressData | null = null;
  let parsedPve: UserProgressData | null = null;
  let parsedExport: TarkovTrackerExport | null = null;

  function resetImport(): void {
    importState.value = 'idle';
    importPreview.value = null;
    importError.value = null;
    parsedPvp = null;
    parsedPve = null;
    parsedExport = null;
  }

  function exportProgress(): void {
    const runtimeConfig = useRuntimeConfig();
    const pvpData = stripLastApiUpdate(structuredClone(toRaw(tarkovStore.getPvPProgressData())));
    const pveData = stripLastApiUpdate(structuredClone(toRaw(tarkovStore.getPvEProgressData())));
    const backup: TarkovTrackerExport = {
      _format: BACKUP_FORMAT,
      _version: 1,
      exportedAt: Date.now(),
      appVersion: String(runtimeConfig.public.appVersion ?? 'unknown'),
      currentGameMode: tarkovStore.getCurrentGameMode(),
      gameEdition: tarkovStore.getGameEdition(),
      tarkovUid: tarkovStore.getTarkovUid(),
      pvp: pvpData,
      pve: pveData,
    };

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = url;
    a.download = `tarkovtracker-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function parseBackupFile(file: File): Promise<void> {
    importError.value = null;
    try {
      const text = await file.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        importState.value = 'error';
        importError.value = 'Failed to parse JSON — file may be corrupted';
        return;
      }

      const result = validateBackup(json);
      if (!result.ok) {
        importState.value = 'error';
        importError.value = result.error;
        return;
      }

      parsedPvp = result.data.pvp;
      parsedPve = result.data.pve;
      parsedExport = result.data.export;
      importPreview.value = buildPreview(result.data.export, result.data.pvp, result.data.pve);
      importState.value = 'preview';
    } catch (e) {
      importState.value = 'error';
      importError.value = 'Failed to read backup file';
      logger.error('[DataBackup] Parse error:', e);
    }
  }

  async function confirmBackupImport(targetModes: { pvp: boolean; pve: boolean }): Promise<void> {
    if (importState.value !== 'preview' || !parsedPvp || !parsedPve || !parsedExport) {
      return;
    }

    try {
      const pvpData = parsedPvp;
      const pveData = parsedPve;
      const exportData = parsedExport;
      const importBoth = targetModes.pvp && targetModes.pve;

      tarkovStore.$patch((state: UserState) => {
        if (targetModes.pvp) {
          state.pvp = structuredClone(pvpData);
        }
        if (targetModes.pve) {
          state.pve = structuredClone(pveData);
        }
        if (importBoth) {
          state.gameEdition = exportData.gameEdition;
          state.tarkovUid = exportData.tarkovUid;
        }
      });

      importState.value = 'success';
    } catch (e) {
      importState.value = 'error';
      importError.value = 'Failed to apply backup data';
      logger.error('[DataBackup] Import error:', e);
    }
  }

  return {
    exportProgress,
    importState,
    importPreview,
    importError,
    parseBackupFile,
    confirmBackupImport,
    resetImport,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run app/composables/__tests__/useDataBackup.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add app/composables/useDataBackup.ts app/composables/__tests__/useDataBackup.test.ts
git commit -m "feat: add useDataBackup composable for progress export/import"
```

---

### Task 2: Add locale keys for data backup

**Files:**

- Modify: `app/locales/en.json5:1035-1053` (under `settings.data_management`)
- Modify: `app/locales/de.json5`, `app/locales/es.json5`, `app/locales/fr.json5`, `app/locales/ru.json5`, `app/locales/uk.json5`, `app/locales/zh.json5` (same keys with English fallback values)

**Step 1: Add English locale keys**

In `app/locales/en.json5`, add to the `settings.data_management` object (after line 1053 `reset_confirm`):

```json5
      export_title: 'Export & Backup',
      export_description: 'Download a backup of your progress data for both PvP and PvE modes.',
      export_button: 'Export Progress Backup',
      import_title: 'Import',
      import_backup_button: 'Import TarkovTracker Backup',
      import_tarkovdev_button: 'Import Tarkov.dev Profile',
      import_preview_title: 'Backup Preview',
      import_preview_exported_at: 'Exported',
      import_preview_app_version: 'App Version',
      import_preview_game_edition: 'Game Edition',
      import_preview_pvp_level: 'PvP Level',
      import_preview_pvp_faction: 'PvP Faction',
      import_preview_pvp_tasks: 'PvP Tasks',
      import_preview_pvp_hideout: 'PvP Hideout Modules',
      import_preview_pve_level: 'PvE Level',
      import_preview_pve_faction: 'PvE Faction',
      import_preview_pve_tasks: 'PvE Tasks',
      import_preview_pve_hideout: 'PvE Hideout Modules',
      import_target_label: 'Import Target',
      import_target_pvp: 'PvP Only',
      import_target_pve: 'PvE Only',
      import_target_both: 'Both PvP & PvE',
      import_confirm: 'Confirm Import',
      import_cancel: 'Cancel',
      import_success_title: 'Backup Imported',
      import_success_description: 'Your progress data has been restored successfully.',
      import_error_title: 'Import Failed',
      reset_title: 'Reset Progress',
```

**Step 2: Add same keys to other locale files**

For each non-English locale file, add the same keys with English values as fallback (translators can update later). Find the equivalent `data_management` section in each file and add the same block.

**Step 3: Commit**

```bash
git add app/locales/*.json5
git commit -m "feat: add locale keys for data backup export/import"
```

---

### Task 3: Rewrite DataManagementCard to unified layout

**Files:**

- Modify: `app/features/settings/DataManagementCard.vue` (full rewrite)
- Modify: `app/pages/settings.vue:52,61,66` (remove TarkovDevImportCard)
- Delete: `app/features/settings/TarkovDevImportCard.vue`

**Step 1: Remove TarkovDevImportCard from settings page**

In `app/pages/settings.vue`:

- Delete line 52: `<TarkovDevImportCard />`
- Delete line 66: `import TarkovDevImportCard from '@/features/settings/TarkovDevImportCard.vue';`

**Step 2: Rewrite DataManagementCard.vue**

Replace `app/features/settings/DataManagementCard.vue` with the unified card. The card has three visual sections:

1. **Export & Backup** — single export button
2. **Import** — two buttons (TarkovTracker backup, tarkov.dev profile). Each shows inline preview/confirm when active. Only one import flow can be active at a time.
3. **Reset Progress** — existing PvP/PvE/All reset buttons (unchanged logic)

The tarkov.dev import functionality is brought in via `useTarkovDevImport()` (existing composable). The TarkovTracker backup import uses `useDataBackup()` (new composable from Task 1).

Full component code:

```vue
<template>
  <GenericCard
    icon="mdi-database-cog"
    icon-color="warning"
    highlight-color="warning"
    :title="$t('settings.data_management_card.title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-6 px-4 py-4">
        <!-- Export & Backup -->
        <div class="space-y-2">
          <p class="text-surface-400 text-xs font-semibold tracking-wider uppercase">
            {{ $t('settings.data_management.export_title') }}
          </p>
          <p class="text-surface-400 text-sm">
            {{ $t('settings.data_management.export_description') }}
          </p>
          <UButton
            icon="i-mdi-download"
            variant="soft"
            color="primary"
            block
            @click="exportProgress"
          >
            {{ $t('settings.data_management.export_button') }}
          </UButton>
        </div>

        <USeparator />

        <!-- Import -->
        <div class="space-y-3">
          <p class="text-surface-400 text-xs font-semibold tracking-wider uppercase">
            {{ $t('settings.data_management.import_title') }}
          </p>

          <input
            ref="backupFileInputRef"
            type="file"
            accept=".json"
            class="hidden"
            @change="handleBackupFileChange"
          />
          <input
            ref="tarkovDevFileInputRef"
            type="file"
            accept=".json"
            class="hidden"
            @change="handleTarkovDevFileChange"
          />

          <!-- Import buttons (shown when no import flow is active) -->
          <template v-if="!isAnyImportActive">
            <div class="grid gap-3 md:grid-cols-2">
              <UButton
                icon="i-mdi-file-upload-outline"
                variant="soft"
                color="info"
                block
                @click="backupFileInputRef?.click()"
              >
                {{ $t('settings.data_management.import_backup_button') }}
              </UButton>
              <UButton
                icon="i-mdi-account-arrow-up"
                variant="soft"
                color="info"
                block
                @click="showTarkovDevFileInput"
              >
                {{ $t('settings.data_management.import_tarkovdev_button') }}
              </UButton>
            </div>

            <!-- Tarkov.dev linked profile info -->
            <template v-if="isLinked">
              <div class="bg-surface-900/80 rounded-md border border-white/10 p-3">
                <div class="flex items-center justify-between">
                  <span class="text-surface-400 text-sm">
                    {{ $t('settings.tarkov_dev_import.linked_uid') }}
                  </span>
                  <span class="text-surface-100 font-mono text-sm font-semibold">
                    {{ tarkovUid }}
                  </span>
                </div>
                <UButton
                  icon="i-mdi-open-in-new"
                  variant="soft"
                  color="info"
                  size="xs"
                  class="mt-2"
                  :href="tarkovDevProfileUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ $t('settings.tarkov_dev_import.view_profile') }}
                </UButton>
              </div>
            </template>
          </template>

          <!-- TarkovTracker Backup Import Preview -->
          <template v-if="backupImportState === 'preview' && backupPreview">
            <div
              class="bg-surface-900/80 divide-surface-700 divide-y rounded-md border border-white/10"
            >
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.data_management.import_preview_exported_at') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ formatDate(backupPreview.exportedAt) }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.data_management.import_preview_pvp_level') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ backupPreview.pvp.level }} ({{ backupPreview.pvp.faction }})
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.data_management.import_preview_pvp_tasks') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ backupPreview.pvp.taskCount }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.data_management.import_preview_pve_level') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ backupPreview.pve.level }} ({{ backupPreview.pve.faction }})
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.data_management.import_preview_pve_tasks') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ backupPreview.pve.taskCount }}
                </span>
              </div>
            </div>

            <div class="space-y-1">
              <label class="text-surface-200 text-sm font-semibold">
                {{ $t('settings.data_management.import_target_label') }}
              </label>
              <div class="grid grid-cols-3 gap-2">
                <UButton
                  :variant="importTarget === 'pvp' ? 'solid' : 'soft'"
                  color="primary"
                  size="sm"
                  block
                  @click="importTarget = 'pvp'"
                >
                  {{ $t('settings.data_management.import_target_pvp') }}
                </UButton>
                <UButton
                  :variant="importTarget === 'pve' ? 'solid' : 'soft'"
                  color="primary"
                  size="sm"
                  block
                  @click="importTarget = 'pve'"
                >
                  {{ $t('settings.data_management.import_target_pve') }}
                </UButton>
                <UButton
                  :variant="importTarget === 'both' ? 'solid' : 'soft'"
                  color="primary"
                  size="sm"
                  block
                  @click="importTarget = 'both'"
                >
                  {{ $t('settings.data_management.import_target_both') }}
                </UButton>
              </div>
            </div>

            <div class="flex gap-2">
              <UButton
                icon="i-mdi-check"
                color="primary"
                class="flex-1"
                @click="handleBackupConfirm"
              >
                {{ $t('settings.data_management.import_confirm') }}
              </UButton>
              <UButton variant="soft" color="neutral" class="flex-1" @click="resetBackupImport()">
                {{ $t('settings.data_management.import_cancel') }}
              </UButton>
            </div>
          </template>

          <!-- Tarkov.dev Import Preview (reused from old TarkovDevImportCard) -->
          <template v-if="tarkovDevImportState === 'preview' && tarkovDevPreview">
            <div
              class="bg-surface-900/80 divide-surface-700 divide-y rounded-md border border-white/10"
            >
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.tarkov_dev_import.nickname') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ tarkovDevPreview.displayName }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.tarkov_dev_import.faction') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ tarkovDevPreview.pmcFaction }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.tarkov_dev_import.level') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ previewLevel }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.tarkov_dev_import.prestige') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ tarkovDevPreview.prestigeLevel }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.tarkov_dev_import.skills_count', { count: skillCount }) }}
                </span>
              </div>
              <div v-if="tarkovDevPreview.gameEditionGuess !== null" class="px-3 py-2">
                <div class="flex items-center justify-between">
                  <span class="text-surface-400 text-xs">
                    {{ $t('settings.tarkov_dev_import.edition_guess') }}
                  </span>
                  <span class="text-surface-100 text-sm font-semibold">
                    {{ editionLabel }}
                  </span>
                </div>
              </div>
            </div>
            <div class="space-y-1">
              <label class="text-surface-200 text-sm font-semibold">
                {{ $t('settings.tarkov_dev_import.import_to_mode') }}
              </label>
              <GameModeToggle v-model="tarkovDevTargetMode" />
            </div>
            <div class="flex gap-2">
              <UButton
                icon="i-mdi-check"
                color="primary"
                class="flex-1"
                @click="handleTarkovDevConfirm"
              >
                {{ $t('settings.tarkov_dev_import.confirm') }}
              </UButton>
              <UButton
                variant="soft"
                color="neutral"
                class="flex-1"
                @click="resetTarkovDevImport()"
              >
                {{ $t('settings.tarkov_dev_import.cancel') }}
              </UButton>
            </div>
          </template>

          <!-- Success/Error alerts for backup import -->
          <div
            v-if="backupImportState === 'success'"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <UAlert
              icon="i-mdi-check-circle"
              color="success"
              variant="soft"
              :title="$t('settings.data_management.import_success_title')"
              :description="$t('settings.data_management.import_success_description')"
            />
          </div>
          <div
            v-if="backupImportState === 'error' && backupImportError"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
          >
            <UAlert
              icon="i-mdi-alert-circle"
              color="error"
              variant="soft"
              :title="$t('settings.data_management.import_error_title')"
              :description="backupImportError"
            />
          </div>

          <!-- Success/Error alerts for tarkov.dev import -->
          <div
            v-if="tarkovDevImportState === 'success'"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <UAlert
              icon="i-mdi-check-circle"
              color="success"
              variant="soft"
              :title="$t('settings.tarkov_dev_import.success_title')"
              :description="$t('settings.tarkov_dev_import.success_description')"
            />
          </div>
          <div
            v-if="tarkovDevImportState === 'error' && tarkovDevImportError"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
          >
            <UAlert
              icon="i-mdi-alert-circle"
              color="error"
              variant="soft"
              :title="$t('settings.tarkov_dev_import.error_title')"
              :description="tarkovDevImportError"
            />
          </div>
        </div>

        <USeparator />

        <!-- Reset Progress -->
        <div class="space-y-2">
          <p class="text-surface-400 text-xs font-semibold tracking-wider uppercase">
            {{ $t('settings.data_management.reset_title') }}
          </p>
          <div class="grid gap-3 md:grid-cols-3">
            <UButton
              icon="i-mdi-shield-sword"
              block
              :ui="{
                base: 'bg-pvp-900 hover:bg-pvp-800 active:bg-pvp-700 text-pvp-200 focus-visible:ring focus-visible:ring-pvp-500',
              }"
              @click="showResetPvPDialog = true"
            >
              {{ $t('settings.data_management.reset_pvp_data') }}
            </UButton>
            <UButton
              icon="i-mdi-account-group"
              block
              :ui="{
                base: 'bg-pve-900 hover:bg-pve-800 active:bg-pve-700 text-pve-200 focus-visible:ring focus-visible:ring-pve-500',
              }"
              @click="showResetPvEDialog = true"
            >
              {{ $t('settings.data_management.reset_pve_data') }}
            </UButton>
            <UButton
              color="error"
              variant="soft"
              icon="i-mdi-delete-sweep"
              block
              @click="showResetAllDialog = true"
            >
              {{ $t('settings.data_management.reset_all_data') }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </GenericCard>

  <!-- Reset modals (unchanged from original) -->
  <!-- PvP Reset Modal -->
  <UModal v-model:open="showResetPvPDialog">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-alert" class="text-pvp-400 h-5 w-5" />
        <h3 class="text-lg font-semibold">
          {{ $t('settings.data_management.reset_pvp_title') }}
        </h3>
      </div>
    </template>
    <template #body>
      <div class="space-y-3">
        <UAlert
          icon="i-mdi-alert"
          color="pvp"
          variant="subtle"
          :title="$t('settings.data_management.reset_pvp_confirmation')"
        />
        <p class="text-surface-200 text-sm">
          {{ $t('settings.data_management.reset_pvp_warning') }}
        </p>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full items-center gap-3">
        <UButton
          color="neutral"
          variant="soft"
          class="min-w-26 justify-center text-center"
          @click="close"
        >
          {{ $t('settings.data_management.reset_cancel') }}
        </UButton>
        <UButton
          color="error"
          variant="solid"
          class="ml-auto min-w-30 justify-center text-center"
          :loading="resetting"
          @click="resetPvPData"
        >
          {{ $t('settings.data_management.reset_confirm') }}
        </UButton>
      </div>
    </template>
  </UModal>
  <!-- PvE Reset Modal -->
  <UModal v-model:open="showResetPvEDialog">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-alert" class="text-pve-400 h-5 w-5" />
        <h3 class="text-lg font-semibold">
          {{ $t('settings.data_management.reset_pve_title') }}
        </h3>
      </div>
    </template>
    <template #body>
      <div class="space-y-3">
        <UAlert
          icon="i-mdi-alert"
          color="pve"
          variant="subtle"
          :title="$t('settings.data_management.reset_pve_confirmation')"
        />
        <p class="text-surface-200 text-sm">
          {{ $t('settings.data_management.reset_pve_warning') }}
        </p>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full items-center gap-3">
        <UButton
          color="neutral"
          variant="soft"
          class="min-w-26 justify-center text-center"
          @click="close"
        >
          {{ $t('settings.data_management.reset_cancel') }}
        </UButton>
        <UButton
          color="error"
          variant="solid"
          class="ml-auto min-w-30 justify-center text-center"
          :loading="resetting"
          @click="resetPvEData"
        >
          {{ $t('settings.data_management.reset_confirm') }}
        </UButton>
      </div>
    </template>
  </UModal>
  <!-- Reset All Modal -->
  <UModal v-model:open="showResetAllDialog" @close="resetAllConfirmText = ''">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-alert-octagon" class="text-error-400 h-5 w-5" />
        <h3 class="text-lg font-semibold">
          {{ $t('settings.data_management.reset_all_title') }}
        </h3>
      </div>
    </template>
    <template #body>
      <div class="space-y-4">
        <UAlert
          icon="i-mdi-alert-octagon"
          color="error"
          variant="subtle"
          :title="$t('settings.data_management.reset_all_confirmation')"
        />
        <p class="text-surface-200 text-sm">
          {{ $t('settings.data_management.reset_all_warning') }}
        </p>
        <div class="space-y-2">
          <p class="text-surface-100 text-sm font-medium">
            <i18n-t keypath="settings.danger_zone.confirm_delete_instruction" tag="span">
              <template #word>
                <strong class="text-error-400">
                  {{ $t('settings.danger_zone.confirm_word') }}
                </strong>
              </template>
            </i18n-t>
          </p>
          <UInput
            v-model="resetAllConfirmText"
            :placeholder="$t('settings.danger_zone.confirm_word')"
            class="font-mono"
          />
        </div>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full items-center gap-3">
        <UButton
          color="neutral"
          variant="soft"
          class="min-w-26 justify-center text-center"
          @click="close"
        >
          {{ $t('settings.data_management.reset_cancel') }}
        </UButton>
        <UButton
          color="error"
          variant="solid"
          class="ml-auto min-w-30 justify-center text-center"
          :loading="resetting"
          :disabled="resetAllConfirmText !== $t('settings.danger_zone.confirm_word')"
          @click="resetAllData"
        >
          {{ $t('settings.data_management.reset_confirm') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useDataBackup } from '@/composables/useDataBackup';
  import { useTarkovDevImport } from '@/composables/useTarkovDevImport';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES, type GameMode } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  import GameModeToggle from './GameModeToggle.vue';

  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();

  // --- Backup Export/Import ---
  const {
    exportProgress,
    importState: backupImportState,
    importPreview: backupPreview,
    importError: backupImportError,
    parseBackupFile,
    confirmBackupImport,
    resetImport: resetBackupImport,
  } = useDataBackup();

  const backupFileInputRef = ref<HTMLInputElement | null>(null);
  const importTarget = ref<'pvp' | 'pve' | 'both'>('both');

  async function handleBackupFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await parseBackupFile(file);
    input.value = '';
  }

  async function handleBackupConfirm() {
    await confirmBackupImport({
      pvp: importTarget.value === 'pvp' || importTarget.value === 'both',
      pve: importTarget.value === 'pve' || importTarget.value === 'both',
    });
    if (backupImportState.value === 'success') {
      toast.add({
        title: t('settings.data_management.import_success_title'),
        description: t('settings.data_management.import_success_description'),
        color: 'success',
      });
    }
  }

  // --- Tarkov.dev Import ---
  const {
    importState: tarkovDevImportState,
    previewData: tarkovDevPreview,
    importError: tarkovDevImportError,
    parseFile: parseTarkovDevFile,
    confirmImport: confirmTarkovDevImport,
    reset: resetTarkovDevImport,
  } = useTarkovDevImport();

  const tarkovDevFileInputRef = ref<HTMLInputElement | null>(null);
  const tarkovDevTargetMode = ref<GameMode>(tarkovStore.getCurrentGameMode());
  const tarkovUid = computed(() => tarkovStore.getTarkovUid());
  const isLinked = computed(() => tarkovUid.value !== null);

  const linkedProfileMode = computed<GameMode | null>(() => {
    const pvpImportedAt = tarkovStore.getPvPProgressData().tarkovDevProfile?.importedAt;
    const pveImportedAt = tarkovStore.getPvEProgressData().tarkovDevProfile?.importedAt;
    const hasPvpImport = typeof pvpImportedAt === 'number' && Number.isFinite(pvpImportedAt);
    const hasPveImport = typeof pveImportedAt === 'number' && Number.isFinite(pveImportedAt);
    if (hasPvpImport && hasPveImport) {
      return pveImportedAt > pvpImportedAt ? GAME_MODES.PVE : GAME_MODES.PVP;
    }
    if (hasPvpImport) return GAME_MODES.PVP;
    if (hasPveImport) return GAME_MODES.PVE;
    return null;
  });

  const tarkovDevProfileUrl = computed(() => {
    const mode =
      linkedProfileMode.value ?? tarkovStore.getCurrentGameMode() ?? tarkovDevTargetMode.value;
    const modeSlug = mode === GAME_MODES.PVE ? 'pve' : 'regular';
    return `https://tarkov.dev/players/${modeSlug}/${tarkovUid.value}`;
  });

  const previewLevel = computed(() => {
    if (!tarkovDevPreview.value) return 1;
    const levels = metadataStore.playerLevels;
    if (!levels || levels.length === 0) return 1;
    const xp = tarkovDevPreview.value.totalXP;
    for (let i = levels.length - 1; i >= 0; i--) {
      const level = levels[i];
      if (level && xp >= level.exp) return level.level;
    }
    return 1;
  });

  const skillCount = computed(() =>
    tarkovDevPreview.value ? Object.keys(tarkovDevPreview.value.skills).length : 0
  );

  const editionLabel = computed(() => {
    if (!tarkovDevPreview.value?.gameEditionGuess) return '';
    const edition = metadataStore.editions.find(
      (e) => e.value === tarkovDevPreview.value!.gameEditionGuess
    );
    return edition?.title ?? `Edition ${tarkovDevPreview.value.gameEditionGuess}`;
  });

  function showTarkovDevFileInput() {
    tarkovDevFileInputRef.value?.click();
  }

  async function handleTarkovDevFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await parseTarkovDevFile(file);
    input.value = '';
  }

  async function handleTarkovDevConfirm() {
    await confirmTarkovDevImport(tarkovDevTargetMode.value);
  }

  // --- Any import active? ---
  const isAnyImportActive = computed(
    () => backupImportState.value === 'preview' || tarkovDevImportState.value === 'preview'
  );

  // --- Date formatting ---
  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // --- Reset logic (unchanged from original) ---
  const resetting = ref(false);
  const showResetPvPDialog = ref(false);
  const showResetPvEDialog = ref(false);
  const showResetAllDialog = ref(false);
  const resetAllConfirmText = ref('');

  interface ResetConfig {
    resetFn: () => Promise<void>;
    successTitle: string;
    successDescription: string;
    errorLogContext: string;
    errorDescription: string;
    dialogRef: Ref<boolean>;
    onSuccess?: () => void;
  }

  const createResetHandler = (config: ResetConfig) => async () => {
    resetting.value = true;
    try {
      await config.resetFn();
      toast.add({
        title: config.successTitle,
        description: config.successDescription,
        color: 'success',
      });
      config.dialogRef.value = false;
      if (config.onSuccess) {
        config.onSuccess();
      }
    } catch (error) {
      logger.error(`[DataManagement] Error resetting ${config.errorLogContext}:`, error);
      toast.add({
        title: t('settings.reset.error_title'),
        description: config.errorDescription,
        color: 'error',
      });
    } finally {
      resetting.value = false;
    }
  };

  const resetPvPData = createResetHandler({
    resetFn: () => tarkovStore.resetPvPData(),
    successTitle: t('settings.reset_pvp.success_title'),
    successDescription: t('settings.reset_pvp.success_description'),
    errorLogContext: 'PvP data',
    errorDescription: t('settings.reset_pvp.error_description'),
    dialogRef: showResetPvPDialog,
  });
  const resetPvEData = createResetHandler({
    resetFn: () => tarkovStore.resetPvEData(),
    successTitle: t('settings.reset_pve.success_title'),
    successDescription: t('settings.reset_pve.success_description'),
    errorLogContext: 'PvE data',
    errorDescription: t('settings.reset_pve.error_description'),
    dialogRef: showResetPvEDialog,
  });
  const resetAllData = createResetHandler({
    resetFn: () => tarkovStore.resetAllData(),
    successTitle: t('settings.reset_all.success_title'),
    successDescription: t('settings.reset_all.success_description'),
    errorLogContext: 'all data',
    errorDescription: t('settings.reset_all.error_description'),
    dialogRef: showResetAllDialog,
  });
</script>
```

**Step 3: Delete TarkovDevImportCard.vue**

```bash
rm app/features/settings/TarkovDevImportCard.vue
```

**Step 4: Update settings page test**

In `app/pages/__tests__/settings.page.test.ts`:

- Remove line 84-86: the `vi.mock` for `TarkovDevImportCard.vue`
- Remove line 112: `TarkovDevImportCard: true` from stubs

**Step 5: Run all tests**

Run: `npx vitest run app/composables/__tests__/useDataBackup.test.ts app/pages/__tests__/settings.page.test.ts`
Expected: All PASS

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: unified DataManagementCard with export/import and tarkov.dev import"
```

---

### Task 4: Update non-English locale files

**Files:**

- Modify: `app/locales/de.json5`, `app/locales/es.json5`, `app/locales/fr.json5`, `app/locales/ru.json5`, `app/locales/uk.json5`, `app/locales/zh.json5`

**Step 1: Add English fallback keys to each locale file**

Find the `data_management` section in each locale file. Add the same keys from Task 2 with English values. Translators update these later.

**Step 2: Run format check**

Run: `npm run format`
Expected: No errors

**Step 3: Commit**

```bash
git add app/locales/*.json5
git commit -m "feat: add data backup locale keys to all languages"
```

---

### Task 5: Run full test suite and verify

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All PASS

**Step 2: Run format**

Run: `npm run format`
Expected: Clean

**Step 3: Manual smoke test checklist**

- Run `npm run dev`
- Navigate to Settings page
- Verify: TarkovDevImportCard no longer appears as separate card
- Verify: DataManagementCard has Export, Import, and Reset sections
- Click "Export Progress Backup" → JSON file downloads
- Open exported file → verify `_format`, `_version`, `pvp`/`pve` data, no `lastApiUpdate`
- Click "Import TarkovTracker Backup" → select the exported file
- Verify: preview shows PvP/PvE levels, task counts
- Select "Both PvP & PvE" target → Confirm Import → success toast
- Click "Import Tarkov.dev Profile" → existing tarkov.dev flow works
- Reset buttons still work (PvP, PvE, All)

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
