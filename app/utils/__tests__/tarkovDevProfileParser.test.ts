import { describe, it, expect } from 'vitest';
import { validateTarkovDevProfile, parseTarkovDevProfile } from '@/utils/tarkovDevProfileParser';
const buildValidProfile = (overrides?: Record<string, unknown>) => ({
  aid: 8560316,
  info: {
    nickname: 'TestPlayer',
    side: 'Usec',
    experience: 217726,
    memberCategory: 2,
    prestigeLevel: 0,
  },
  skills: {
    Common: [
      { Id: 'Endurance', Progress: 448.0368 },
      { Id: 'Strength', Progress: 684.279 },
      { Id: 'BotReload', Progress: 0 },
      { Id: 'BotSound', Progress: 0 },
    ],
  },
  ...overrides,
});
describe('validateTarkovDevProfile', () => {
  it('accepts a valid profile', () => {
    expect(validateTarkovDevProfile(buildValidProfile())).toBe(true);
  });
  it('rejects null', () => {
    expect(validateTarkovDevProfile(null)).toBe(false);
  });
  it('rejects non-object', () => {
    expect(validateTarkovDevProfile('string')).toBe(false);
    expect(validateTarkovDevProfile(42)).toBe(false);
  });
  it('rejects missing aid', () => {
    expect(validateTarkovDevProfile(buildValidProfile({ aid: undefined }))).toBe(false);
  });
  it('rejects non-positive aid', () => {
    expect(validateTarkovDevProfile(buildValidProfile({ aid: 0 }))).toBe(false);
    expect(validateTarkovDevProfile(buildValidProfile({ aid: -1 }))).toBe(false);
  });
  it('rejects non-integer aid', () => {
    expect(validateTarkovDevProfile(buildValidProfile({ aid: 1.5 }))).toBe(false);
  });
  it('rejects aid exceeding Number.MAX_SAFE_INTEGER', () => {
    expect(validateTarkovDevProfile(buildValidProfile({ aid: Number.MAX_SAFE_INTEGER + 1 }))).toBe(
      false
    );
  });
  it('rejects missing info.side', () => {
    expect(
      validateTarkovDevProfile(buildValidProfile({ info: { nickname: 'X', experience: 100 } }))
    ).toBe(false);
  });
  it('rejects missing info.experience', () => {
    expect(
      validateTarkovDevProfile(buildValidProfile({ info: { nickname: 'X', side: 'Usec' } }))
    ).toBe(false);
  });
  it('rejects missing skills.Common', () => {
    expect(validateTarkovDevProfile(buildValidProfile({ skills: {} }))).toBe(false);
  });
});
describe('parseTarkovDevProfile', () => {
  it('parses a valid profile', () => {
    const result = parseTarkovDevProfile(buildValidProfile());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.tarkovUid).toBe(8560316);
    expect(result.data.displayName).toBe('TestPlayer');
    expect(result.data.pmcFaction).toBe('USEC');
    expect(result.data.totalXP).toBe(217726);
    expect(result.data.prestigeLevel).toBe(0);
  });
  it('computes skill levels from Progress / 100 floored', () => {
    const result = parseTarkovDevProfile(buildValidProfile());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.skills.Endurance).toBe(4);
    expect(result.data.skills.Strength).toBe(6);
  });
  it('filters out bot skills', () => {
    const result = parseTarkovDevProfile(buildValidProfile());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.skills.BotReload).toBeUndefined();
    expect(result.data.skills.BotSound).toBeUndefined();
  });
  it('handles Progress=0 correctly', () => {
    const profile = buildValidProfile({
      skills: {
        Common: [{ Id: 'Pistol', Progress: 0 }],
      },
    });
    const result = parseTarkovDevProfile(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.skills.Pistol).toBe(0);
  });
  it('caps skill level at 51', () => {
    const profile = buildValidProfile({
      skills: {
        Common: [{ Id: 'Endurance', Progress: 5200 }],
      },
    });
    const result = parseTarkovDevProfile(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.skills.Endurance).toBe(51);
  });
  it('normalizes faction Usec to USEC', () => {
    const result = parseTarkovDevProfile(buildValidProfile());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pmcFaction).toBe('USEC');
  });
  it('normalizes faction Bear to BEAR', () => {
    const profile = buildValidProfile({
      info: {
        nickname: 'BearPlayer',
        side: 'Bear',
        experience: 100,
        memberCategory: 0,
        prestigeLevel: 0,
      },
    });
    const result = parseTarkovDevProfile(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pmcFaction).toBe('BEAR');
  });
  it('maps memberCategory 0 to edition 1 (Standard)', () => {
    const profile = buildValidProfile({
      info: {
        nickname: 'X',
        side: 'Usec',
        experience: 100,
        memberCategory: 0,
        prestigeLevel: 0,
      },
    });
    const result = parseTarkovDevProfile(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.gameEditionGuess).toBe(1);
  });
  it('maps memberCategory 2 to edition 4 (EoD)', () => {
    const result = parseTarkovDevProfile(buildValidProfile());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.gameEditionGuess).toBe(4);
  });
  it('maps memberCategory 1024 to edition 5 (Unheard)', () => {
    const profile = buildValidProfile({
      info: {
        nickname: 'X',
        side: 'Usec',
        experience: 100,
        memberCategory: 1024,
        prestigeLevel: 0,
      },
    });
    const result = parseTarkovDevProfile(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.gameEditionGuess).toBe(5);
  });
  it('maps memberCategory 1026 to edition 6 (EoD + Unheard)', () => {
    const profile = buildValidProfile({
      info: {
        nickname: 'X',
        side: 'Usec',
        experience: 100,
        memberCategory: 1026,
        prestigeLevel: 0,
      },
    });
    const result = parseTarkovDevProfile(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.gameEditionGuess).toBe(6);
  });
  it('returns null for unknown memberCategory', () => {
    const profile = buildValidProfile({
      info: {
        nickname: 'X',
        side: 'Usec',
        experience: 100,
        memberCategory: 99,
        prestigeLevel: 0,
      },
    });
    const result = parseTarkovDevProfile(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.gameEditionGuess).toBeNull();
  });
  it('clamps prestige to 0-6', () => {
    const profile = buildValidProfile({
      info: {
        nickname: 'X',
        side: 'Usec',
        experience: 100,
        prestigeLevel: 10,
      },
    });
    const result = parseTarkovDevProfile(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.prestigeLevel).toBe(6);
  });
  it('defaults prestige to 0 when missing', () => {
    const profile = buildValidProfile({
      info: {
        nickname: 'X',
        side: 'Usec',
        experience: 100,
      },
    });
    const result = parseTarkovDevProfile(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.prestigeLevel).toBe(0);
  });
  it('returns error for invalid input', () => {
    const result = parseTarkovDevProfile({ foo: 'bar' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });
  it('includes rawProfile with importedAt timestamp', () => {
    const before = Date.now();
    const result = parseTarkovDevProfile(buildValidProfile());
    const after = Date.now();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rawProfile.importedAt).toBeGreaterThanOrEqual(before);
    expect(result.data.rawProfile.importedAt).toBeLessThanOrEqual(after);
  });
  it('handles missing optional rawProfile fields gracefully', () => {
    const result = parseTarkovDevProfile(buildValidProfile());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rawProfile.achievements).toEqual({});
    expect(result.data.rawProfile.mastering).toEqual([]);
  });
  it('filters non-number values from achievements', () => {
    const profile = buildValidProfile({
      achievements: { valid: 1234567890, bad_string: 'not-a-number', bad_null: null },
    });
    const result = parseTarkovDevProfile(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rawProfile.achievements).toEqual({ valid: 1234567890 });
  });
  it('filters malformed mastering entries', () => {
    const profile = buildValidProfile({
      mastering: [
        { Id: 'weapon1', Progress: 500 },
        { bad: true },
        'not-an-object',
        { Id: 123, Progress: 100 },
        { Id: 'weapon2', Progress: 200, Kills: 10 },
      ],
    });
    const result = parseTarkovDevProfile(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rawProfile.mastering).toEqual([
      { Id: 'weapon1', Progress: 500 },
      { Id: 'weapon2', Progress: 200, Kills: 10 },
    ]);
  });
});
