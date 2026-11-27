import { beforeEach, describe, expect, it } from 'vitest';
import { useSetupCheckpoint } from '@/features/setup/useSetupCheckpoint';
describe('useSetupCheckpoint', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it('routes the import path directly to eft-logs when tarkov.dev succeeds and back cleanly', () => {
    const cp = useSetupCheckpoint();
    expect(cp.step.value).toBe('start');
    cp.selectPath('import');
    expect(cp.path.value).toBe('import');
    expect(cp.step.value).toBe('tarkov-dev');
    expect(cp.visibleSteps.value).toEqual(['start', 'tarkov-dev', 'eft-logs', 'catch-up', 'done']);
    cp.recordTarkovDevImport('pvp', true);
    expect(cp.tarkovDevImportedModes.value).toEqual(['pvp']);
    expect(cp.editionResolvedByImport.value).toBe(true);
    cp.goNext('imported');
    expect(cp.step.value).toBe('eft-logs');
    expect(cp.previousStep.value).toBe('tarkov-dev');
    cp.goBack();
    expect(cp.step.value).toBe('tarkov-dev');
    expect(cp.previousStep.value).toBe('start');
  });
  it('falls back to manual profile step when tarkov.dev is skipped', () => {
    const cp = useSetupCheckpoint();
    cp.selectPath('import');
    cp.goNext('skipped');
    expect(cp.step.value).toBe('profile');
    expect(cp.visibleSteps.value).toEqual([
      'start',
      'tarkov-dev',
      'profile',
      'eft-logs',
      'catch-up',
      'done',
    ]);
    cp.goBack();
    expect(cp.step.value).toBe('tarkov-dev');
  });
  it('keeps backup path short and never drags through eft-logs or tarkov-dev', () => {
    const cp = useSetupCheckpoint();
    cp.selectPath('backup');
    expect(cp.step.value).toBe('backup');
    expect(cp.visibleSteps.value).toEqual(['start', 'backup', 'done']);
    cp.goNext('imported');
    expect(cp.step.value).toBe('done');
    expect(cp.isCompleted.value).toBe(true);
  });
  it('supports manual path, dismiss, and restart', () => {
    const cp = useSetupCheckpoint();
    cp.selectPath('manual');
    expect(cp.step.value).toBe('profile');
    expect(cp.visibleSteps.value).toEqual(['start', 'profile', 'eft-logs', 'catch-up', 'done']);
    cp.dismiss();
    expect(cp.dismissed.value).toBe(true);
    cp.restart();
    expect(cp.step.value).toBe('start');
    expect(cp.dismissed.value).toBe(false);
    expect(cp.isCompleted.value).toBe(false);
  });
});
