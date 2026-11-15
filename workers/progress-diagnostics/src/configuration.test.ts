// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { unstable_readConfig } from 'wrangler';
describe('Pages collector isolation', () => {
  it('resolves the service only in production and preserves existing production resources', () => {
    const config = fileURLToPath(new URL('../../../wrangler.toml', import.meta.url));
    const read = (env?: string) => unstable_readConfig({ config, env }, { hideWarnings: true });
    const root = read();
    const production = read('production');
    const preview = read('preview');
    expect(production.services).toEqual([
      { binding: 'PROGRESS_DIAGNOSTICS', service: 'tarkovtracker-progress-diagnostics' },
    ]);
    expect(production.durable_objects).toEqual(root.durable_objects);
    expect(production.kv_namespaces).toEqual(root.kv_namespaces);
    expect(production.vars).toEqual(root.vars);
    expect(production.durable_objects.bindings[0]?.name).toBe('API_GATEWAY_LIMITER');
    expect(production.kv_namespaces[0]?.binding).toBe('TARKOV_DATA');
    expect(production.vars.NUXT_PUBLIC_PROGRESS_DIAGNOSTIC_SINK_URL).toBe('');
    expect(root.services).toEqual([]);
    expect(preview.services).toEqual([]);
    expect(preview.durable_objects.bindings).toEqual([]);
    expect(preview.kv_namespaces[0]?.id).not.toBe(production.kv_namespaces[0]?.id);
    expect(preview.vars.NUXT_PUBLIC_PROGRESS_DIAGNOSTIC_SINK_URL).toBe('');
  });
});
