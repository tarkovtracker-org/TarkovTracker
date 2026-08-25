import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const wranglerConfig = readFileSync('workers/api-gateway/wrangler.toml', 'utf8');
describe('api-gateway runtime configuration', () => {
  it('pins the reviewed current compatibility date', () => {
    expect(wranglerConfig).toContain('compatibility_date = "2026-08-25"');
  });
});
