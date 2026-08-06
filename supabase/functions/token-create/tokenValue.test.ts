import { describe, expect, it } from 'vitest';
import {
  generateToken,
  isTokenGameMode,
  isTokenValueForGameMode,
  tokenPrefix,
} from './tokenValue.ts';
describe('isTokenGameMode', () => {
  it('accepts only the supported game modes', () => {
    expect(isTokenGameMode('pvp')).toBe(true);
    expect(isTokenGameMode('pve')).toBe(true);
    expect(isTokenGameMode('seasonal')).toBe(true);
  });
  it('rejects unknown, legacy, and non-string values', () => {
    expect(isTokenGameMode('dual')).toBe(false);
    expect(isTokenGameMode('PVP')).toBe(false);
    expect(isTokenGameMode('')).toBe(false);
    expect(isTokenGameMode(undefined)).toBe(false);
    expect(isTokenGameMode(null)).toBe(false);
  });
});
describe('generateToken', () => {
  it('prefixes generated tokens with the requested game mode', () => {
    expect(generateToken('pvp')).toMatch(/^PVP_[0-9a-f]{18}$/);
    expect(generateToken('pve')).toMatch(/^PVE_[0-9a-f]{18}$/);
    expect(generateToken('seasonal')).toMatch(/^SZN_[0-9a-f]{18}$/);
  });
  it('produces values that pass its own consistency check', () => {
    expect(isTokenValueForGameMode(generateToken('pvp'), 'pvp')).toBe(true);
    expect(isTokenValueForGameMode(generateToken('pve'), 'pve')).toBe(true);
    expect(isTokenValueForGameMode(generateToken('seasonal'), 'seasonal')).toBe(true);
  });
});
describe('isTokenValueForGameMode', () => {
  const pvp = `${tokenPrefix('pvp')}0123456789abcdef01`;
  const pve = `${tokenPrefix('pve')}0123456789abcdef01`;
  const seasonal = `${tokenPrefix('seasonal')}0123456789abcdef01`;
  it('accepts a token value whose prefix matches the game mode', () => {
    expect(isTokenValueForGameMode(pvp, 'pvp')).toBe(true);
    expect(isTokenValueForGameMode(pve, 'pve')).toBe(true);
    expect(isTokenValueForGameMode(seasonal, 'seasonal')).toBe(true);
  });
  it('rejects a token value whose prefix contradicts the game mode', () => {
    expect(isTokenValueForGameMode(pve, 'pvp')).toBe(false);
    expect(isTokenValueForGameMode(pvp, 'pve')).toBe(false);
    expect(isTokenValueForGameMode(seasonal, 'pvp')).toBe(false);
    expect(isTokenValueForGameMode(pvp, 'seasonal')).toBe(false);
  });
  it('rejects legacy tt_ and otherwise malformed token values', () => {
    expect(isTokenValueForGameMode('tt_0123456789abcdef01', 'pvp')).toBe(false);
    expect(isTokenValueForGameMode('PVP_notHex0123456789', 'pvp')).toBe(false);
    expect(isTokenValueForGameMode('PVP_0123', 'pvp')).toBe(false);
    expect(isTokenValueForGameMode('PVP_0123456789ABCDEF01', 'pvp')).toBe(false);
    expect(isTokenValueForGameMode('pvp_0123456789abcdef01', 'pvp')).toBe(false);
  });
});
