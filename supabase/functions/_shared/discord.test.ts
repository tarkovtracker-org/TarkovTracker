import { describe, expect, it } from 'vitest';
import { classifyDiscordRoleStatus } from './discord.ts';

describe('classifyDiscordRoleStatus', () => {
  it('classifies successful role changes', () => {
    expect(classifyDiscordRoleStatus(204)).toBe('success');
    expect(classifyDiscordRoleStatus(200)).toBe('success');
  });

  it('classifies unknown members and users as not in the guild', () => {
    expect(classifyDiscordRoleStatus(404, 10007)).toBe('not_in_guild');
    expect(classifyDiscordRoleStatus(404, 10013)).toBe('not_in_guild');
  });

  it('keeps other Discord failures distinct', () => {
    expect(classifyDiscordRoleStatus(403, 50013)).toBe('failed');
    expect(classifyDiscordRoleStatus(404)).toBe('failed');
  });
});
