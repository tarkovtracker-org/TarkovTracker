import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';
describe('legacy route retirement', () => {
  it('binds only the API host after the apex/www legacy bindings are removed', () => {
    const config = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8');
    const patterns = [...config.matchAll(/pattern = "([^"]+)"/g)].map((match) => match[1]);
    expect(patterns).toEqual(['api.tarkovtracker.org/*']);
  });
});
