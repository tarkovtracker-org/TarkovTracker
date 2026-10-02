import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultState } from '@/stores/progressState';
import { clearAcknowledgedModes, recordAcknowledgedModes } from '@/stores/tarkov/acknowledgedModes';
import {
  clearMetadataEchoes,
  isAcknowledgedMetadataEcho,
  recordMetadataEcho,
} from '@/stores/tarkov/metadataEchoes';
const metadata = {
  currentGameMode: defaultState.currentGameMode,
  gameEdition: defaultState.gameEdition,
  tarkovUid: 1001,
};
describe('acknowledged metadata echo evidence', () => {
  afterEach(() => {
    clearAcknowledgedModes();
    clearMetadataEchoes();
    vi.restoreAllMocks();
  });
  it('matches only server transaction markers and exact old/final metadata tuples', () => {
    recordMetadataEcho('100', metadata, 7);
    expect(isAcknowledgedMetadataEcho('100', { ...metadata, tarkovUid: 7 })).toBe(true);
    expect(isAcknowledgedMetadataEcho('100', metadata)).toBe(true);
    expect(isAcknowledgedMetadataEcho('101', { ...metadata, tarkovUid: 7 })).toBe(false);
    expect(isAcknowledgedMetadataEcho(undefined, metadata)).toBe(false);
    expect(isAcknowledgedMetadataEcho('100', { ...metadata, gameEdition: 99 })).toBe(false);
    expect(isAcknowledgedMetadataEcho('100', { pvp: defaultState.pvp })).toBe(false);
    expect(
      isAcknowledgedMetadataEcho('100', metadata, { ...metadata, pvp: defaultState.pvp })
    ).toBe(false);
  });
  it('expires evidence after thirty seconds', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    recordMetadataEcho('100', metadata, 7);
    now.mockReturnValue(31_000);
    expect(isAcknowledgedMetadataEcho('100', metadata)).toBe(false);
  });
  it('retains at most sixteen transaction outcomes', () => {
    for (let id = 0; id < 17; id++) recordMetadataEcho(String(id), metadata, 7);
    expect(isAcknowledgedMetadataEcho('0', metadata)).toBe(false);
    expect(isAcknowledgedMetadataEcho('1', metadata)).toBe(true);
    expect(isAcknowledgedMetadataEcho('16', metadata)).toBe(true);
  });
  it.each(['reset', 'another-owner'])('clears evidence on %s', (transition) => {
    recordAcknowledgedModes('user-1', {}, { tarkovUid: 7 });
    recordMetadataEcho('100', metadata, 7);
    if (transition === 'reset') clearAcknowledgedModes();
    else recordAcknowledgedModes('user-2', {}, { tarkovUid: 7 });
    expect(isAcknowledgedMetadataEcho('100', metadata)).toBe(false);
  });
});
