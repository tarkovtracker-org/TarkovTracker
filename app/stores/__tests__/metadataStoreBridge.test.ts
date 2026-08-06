import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markProgressMetadataHydrated,
  migrateMetadataDuplicateObjectiveProgress,
  registerProgressMetadataHooks,
  replayProgressMetadataMigration,
  resetProgressMetadataHydration,
} from '@/stores/tarkov/metadataStoreBridge';
describe('metadata store bridge', () => {
  beforeEach(() => {
    resetProgressMetadataHydration({ preserveMetadata: false });
  });
  it('replays known objective migrations for stores hydrated later', () => {
    const migrate = vi.fn();
    const duplicateObjectiveIds = new Map([['objective-1', ['objective-1:task-1']]]);
    registerProgressMetadataHooks({ migrateDuplicateObjectiveProgress: migrate });
    migrateMetadataDuplicateObjectiveProgress(duplicateObjectiveIds);
    markProgressMetadataHydrated();
    replayProgressMetadataMigration();
    expect(migrate).toHaveBeenCalledTimes(2);
    expect(migrate).toHaveBeenLastCalledWith(duplicateObjectiveIds);
  });
  it('replays the validated metadata mapping for a new session', () => {
    const migrate = vi.fn();
    registerProgressMetadataHooks({ migrateDuplicateObjectiveProgress: migrate });
    migrateMetadataDuplicateObjectiveProgress(new Map([['old', ['old:new']]]));
    markProgressMetadataHydrated();
    resetProgressMetadataHydration();
    markProgressMetadataHydrated();
    replayProgressMetadataMigration();
    expect(migrate).toHaveBeenCalledTimes(3);
  });
  it('replays retained mappings when progress hooks register after hydration', () => {
    const migrate = vi.fn();
    const duplicateObjectiveIds = new Map([['objective-1', ['objective-1:task-1']]]);
    migrateMetadataDuplicateObjectiveProgress(duplicateObjectiveIds);
    markProgressMetadataHydrated();
    registerProgressMetadataHooks({ migrateDuplicateObjectiveProgress: migrate });
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(migrate).toHaveBeenCalledWith(duplicateObjectiveIds);
  });
});
