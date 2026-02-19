# Data Export/Import & Unified Data Management Card

## Overview

Merge the tarkov.dev import into the Data Management card and add full progress data export/import (backup/restore) with strict validation.

## Export Format

```typescript
interface TarkovTrackerExport {
  _format: 'tarkovtracker-backup';
  _version: 1;
  exportedAt: number;
  appVersion: string;
  currentGameMode: GameMode;
  gameEdition: number;
  tarkovUid: number | null;
  pvp: UserProgressData;
  pve: UserProgressData;
}
```

Included: level, faction, displayName, xpOffset, taskCompletions, taskObjectives, hideoutParts, hideoutModules, traders, skills, prestigeLevel, skillOffsets, storyChapters, tarkovDevProfile.

Excluded: `lastApiUpdate` (internal sync metadata), user_id, auth tokens, session data, Supabase internals.

Filename: `tarkovtracker-backup-YYYY-MM-DD.json`

## Import Validation Pipeline

Validation constants:

- `SKILL_MAX = 51` (authoritative source: `app/utils/constants.ts` -> `MAX_SKILL_LEVEL`)
- `LEVEL_MIN = 1`
- `PRESTIGE_MIN = 0`, `PRESTIGE_MAX = 6`

1. Parse JSON (catch syntax errors)
2. Format check: `_format === 'tarkovtracker-backup'`, `_version` is supported
3. Schema validation per field:
   - `currentGameMode`: must be exactly `'pvp'` or `'pve'` (reject otherwise)
   - `gameEdition`: integer 1-6
   - `tarkovUid`: number | null
   - `pvp`/`pve`: valid `UserProgressData` shape
   - Within each mode: faction in ['USEC','BEAR']; all dict fields are plain objects; numeric range checks are handled in sanitization (step 4), not rejected here
4. Sanitization: strip unknown keys and clamp numeric fields
   - `level` clamps to `>= LEVEL_MIN` (or defaults to `LEVEL_MIN` when invalid)
   - `prestigeLevel` clamps to `[PRESTIGE_MIN, PRESTIGE_MAX]` (or defaults to `PRESTIGE_MIN` when invalid)
   - `skills[*]` clamps to `[0, SKILL_MAX]` (invalid/non-numeric entries become `0`)
5. Preview: show PvP/PvE level, faction, task count, game edition, export date
6. Target mode selection: user picks PvP, PvE, or Both
7. Confirmation: replace target mode data, trigger Supabase sync

Structural validation errors produce specific, translatable messages. Numeric out-of-range values are sanitized using the clamp policy above.

## Import Strategy

Replace (not merge). Import completely replaces the target mode's progress data.

## Unified DataManagementCard Layout

Single GenericCard with three sections:

1. **Export & Backup**: Download button
2. **Import**: Two buttons side-by-side (TarkovTracker backup, tarkov.dev profile). Each triggers inline preview/confirm flow.
3. **Reset Progress**: Existing PvP/PvE/All reset buttons (unchanged)

Section labels use small `text-surface-400` headings.

## Component Architecture

### Create

- `app/composables/useDataBackup.ts` - Export/import logic

### Modify

- `app/features/settings/DataManagementCard.vue` - Add export, backup import, absorb tarkov.dev import
- `app/pages/settings.vue` - Remove TarkovDevImportCard
- `app/locales/*.json5` - New locale keys

### Delete

- `app/features/settings/TarkovDevImportCard.vue` - Absorbed into DataManagementCard

### Composable API

```typescript
interface UseDataBackupReturn {
  exportProgress: () => Promise<void>;
  exportError: Ref<string | null>;
  importState: Ref<'idle' | 'preview' | 'success' | 'error'>;
  importPreview: Ref<BackupPreviewData | null>;
  importError: Ref<string | null>;
  parseBackupFile: (file: File) => Promise<void>;
  confirmBackupImport: (targetModes: { pvp: boolean; pve: boolean }) => Promise<void>;
  resetImport: () => void;
}
```

No store changes needed. Export reads via getters, import writes via `$patch` + existing sync.
