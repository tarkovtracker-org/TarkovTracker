import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
const wranglerConfig = readFileSync(
  fileURLToPath(new URL('../../wrangler.toml', import.meta.url)),
  'utf8'
);
describe('api-gateway runtime configuration', () => {
  it('pins the reviewed current compatibility date', () => {
    expect(wranglerConfig).toContain('compatibility_date = "2026-08-25"');
  });
});
