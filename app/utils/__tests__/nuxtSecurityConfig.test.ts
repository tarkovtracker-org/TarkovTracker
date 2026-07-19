import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertCloudflarePagesOutput,
  buildContentSecurityPolicyRouteRules,
  DEFAULT_NITRO_PRESET,
  promoteSpaFallback,
  resolveNitroPreset,
} from '@/utils/nuxtSecurityConfig';
describe('nuxtSecurityConfig', () => {
  it('uses cloudflare-pages only as the build preset fallback', () => {
    expect(resolveNitroPreset()).toBe(DEFAULT_NITRO_PRESET);
    expect(resolveNitroPreset('node-server')).toBe('node-server');
  });
  it('promotes the SPA fallback to the static Pages entrypoint', () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'tarkovtracker-spa-'));
    try {
      writeFileSync(join(publicDir, '200.html'), '<main>SPA</main>');
      promoteSpaFallback(publicDir);
      expect(readFileSync(join(publicDir, 'index.html'), 'utf8')).toBe('<main>SPA</main>');
      expect(existsSync(join(publicDir, '200.html'))).toBe(false);
    } finally {
      rmSync(publicDir, { force: true, recursive: true });
    }
  });
  it('leaves an existing SPA entrypoint untouched when no fallback exists', () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'tarkovtracker-spa-'));
    try {
      writeFileSync(join(publicDir, 'index.html'), '<main>SPA</main>');
      promoteSpaFallback(publicDir);
      expect(readFileSync(join(publicDir, 'index.html'), 'utf8')).toBe('<main>SPA</main>');
    } finally {
      rmSync(publicDir, { force: true, recursive: true });
    }
  });
  it('rejects a catch-all Pages Functions build', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'tarkovtracker-pages-'));
    try {
      writeFileSync(join(outputDir, '_routes.json'), JSON.stringify({ include: ['/*'] }));
      writeFileSync(join(outputDir, 'index.html'), '<main>SPA</main>');
      expect(() => assertCloudflarePagesOutput(outputDir, ['/api/*', '/overlay/*'])).toThrow(
        'Unexpected Cloudflare Pages routes'
      );
    } finally {
      rmSync(outputDir, { force: true, recursive: true });
    }
  });
  it('accepts the static SPA Pages output', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'tarkovtracker-pages-'));
    try {
      writeFileSync(
        join(outputDir, '_routes.json'),
        JSON.stringify({ include: ['/api/*', '/overlay/*'] })
      );
      writeFileSync(join(outputDir, 'index.html'), '<main>SPA</main>');
      expect(() => assertCloudflarePagesOutput(outputDir, ['/api/*', '/overlay/*'])).not.toThrow();
    } finally {
      rmSync(outputDir, { force: true, recursive: true });
    }
  });
  it('builds an overlay-specific CSP route rule that is stricter than the app-wide rule', () => {
    const routeRules = buildContentSecurityPolicyRouteRules({
      clientLogSinkUrl: 'https://logs.example.com/v1/collect',
      gaMeasurementId: 'G-ABCDEF1234',
      supabaseUrl: 'https://db.example.com/auth/v1',
    });
    const appCsp = routeRules['/**'].headers['Content-Security-Policy'];
    const overlayCsp = routeRules['/overlay/kappa/**'].headers['Content-Security-Policy'];
    expect(appCsp).toContain("default-src 'self'");
    expect(overlayCsp).toContain("default-src 'none'");
    expect(overlayCsp).toContain("script-src 'unsafe-inline'");
    expect(overlayCsp).toContain("frame-ancestors 'self'");
    expect(overlayCsp).not.toBe(appCsp);
  });
});
