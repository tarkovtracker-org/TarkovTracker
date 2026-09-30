import { describe, expect, it } from 'vitest';
import { isWebUrl, toTrustedGameLinkUrl } from '@/utils/externalUrl';
import { getKeyDevUrl, getKeyPrimaryUrl } from '@/utils/tarkovKeyHelpers';
describe('toTrustedGameLinkUrl', () => {
  it.each([
    'https://tarkov.dev/item/abc',
    'https://escapefromtarkov.fandom.com/wiki/Salewa',
    'https://antifandom.com/escapefromtarkov/wiki/Salewa',
  ])('keeps trusted link %s unchanged', (url) => {
    expect(toTrustedGameLinkUrl(url)).toBe(url);
  });
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'http://tarkov.dev/item/abc',
    'https://user:pass@tarkov.dev/item/abc',
    'https://evil.example/item/abc',
    'https://tarkov.dev.evil.example/item/abc',
    'https://evil.fandom.com/wiki/Salewa',
    '//tarkov.dev/item/abc',
    '/item/abc',
    '',
    'not a url',
    null,
    undefined,
    42,
  ])('rejects %s', (value) => {
    expect(toTrustedGameLinkUrl(value)).toBeUndefined();
  });
});
describe('isWebUrl', () => {
  it('accepts http(s) and rejects script-capable schemes', () => {
    expect(isWebUrl('https://example.com')).toBe(true);
    expect(isWebUrl('http://example.com')).toBe(true);
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
    expect(isWebUrl('data:text/html,x')).toBe(false);
    expect(isWebUrl('/relative')).toBe(false);
  });
});
describe('item link helpers', () => {
  it('fall back to the ID-derived tarkov.dev URL for untrusted links', () => {
    const item = { id: 'abc', link: 'javascript:alert(1)', wikiLink: 'data:text/html,x' };
    expect(getKeyDevUrl(item)).toBe('https://tarkov.dev/item/abc');
    expect(getKeyPrimaryUrl(item)).toBe('https://tarkov.dev/item/abc');
  });
  it('prefer trusted upstream links', () => {
    const item = {
      id: 'abc',
      link: 'https://tarkov.dev/item/salewa',
      wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Salewa',
    };
    expect(getKeyDevUrl(item)).toBe('https://tarkov.dev/item/salewa');
    expect(getKeyPrimaryUrl(item)).toBe('https://escapefromtarkov.fandom.com/wiki/Salewa');
  });
});
