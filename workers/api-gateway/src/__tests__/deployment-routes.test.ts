import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';
describe('staged legacy route retirement', () => {
  it('retains eleven stage-one bindings without retired health or redundant API routes', () => {
    const config = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8');
    const patterns = [...config.matchAll(/pattern = "([^"]+)"/g)].map((match) => match[1]);
    const legacyPaths = [
      '/api/v2',
      '/api/v2/*',
      '/api/token*',
      '/api/progress*',
      '/api/team/progress*',
    ];
    const expected = [
      'api.tarkovtracker.org/*',
      ...['tarkovtracker.org', 'www.tarkovtracker.org'].flatMap((host) =>
        legacyPaths.map((path) => host + path)
      ),
    ];
    expect(patterns.sort()).toEqual(expected.sort());
  });
});
