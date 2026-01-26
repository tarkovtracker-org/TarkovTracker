import { describe, expect, it } from 'vitest';
import { normalizeSearchString, splitSearchTokens } from '@/utils/search';
describe('normalizeSearchString', () => {
  it('converts to lowercase', () => {
    expect(normalizeSearchString('HELLO')).toBe('hello');
    expect(normalizeSearchString('HeLLo WoRLd')).toBe('hello world');
  });
  it('trims whitespace', () => {
    expect(normalizeSearchString('  hello  ')).toBe('hello');
    expect(normalizeSearchString('\thello\n')).toBe('hello');
  });
  it('handles empty string', () => {
    expect(normalizeSearchString('')).toBe('');
    expect(normalizeSearchString('   ')).toBe('');
  });
});
describe('splitSearchTokens', () => {
  it('splits on whitespace', () => {
    expect(splitSearchTokens('punisher 5')).toEqual(['punisher', '5']);
    expect(splitSearchTokens('gas analyzer')).toEqual(['gas', 'analyzer']);
  });
  it('handles multiple spaces', () => {
    expect(splitSearchTokens('  gas  analyzer  ')).toEqual(['gas', 'analyzer']);
  });
  it('normalizes input', () => {
    expect(splitSearchTokens('PUNISHER 5')).toEqual(['punisher', '5']);
    expect(splitSearchTokens('  GAS  Analyzer  ')).toEqual(['gas', 'analyzer']);
  });
  it('returns empty array for empty input', () => {
    expect(splitSearchTokens('')).toEqual([]);
    expect(splitSearchTokens('   ')).toEqual([]);
  });
  it('handles single token', () => {
    expect(splitSearchTokens('punisher')).toEqual(['punisher']);
  });
});
