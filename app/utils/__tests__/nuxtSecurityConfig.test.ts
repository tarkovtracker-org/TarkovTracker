import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertCloudflarePagesOutput,
  pagesHeadersPreventFraming,
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
      writeFileSync(
        join(outputDir, '_headers'),
        "/*\n  Content-Security-Policy: frame-ancestors 'self'\n"
      );
      expect(() => assertCloudflarePagesOutput(outputDir, ['/api/*', '/overlay/*'])).not.toThrow();
    } finally {
      rmSync(outputDir, { force: true, recursive: true });
    }
  });
  it('rejects a Pages header config that allows cross-origin framing', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'tarkovtracker-pages-'));
    try {
      writeFileSync(
        join(outputDir, '_routes.json'),
        JSON.stringify({ include: ['/api/*', '/overlay/*'] })
      );
      writeFileSync(join(outputDir, 'index.html'), '<main>SPA</main>');
      writeFileSync(
        join(outputDir, '_headers'),
        '/*\n  Content-Security-Policy: frame-ancestors *\n'
      );
      expect(() => assertCloudflarePagesOutput(outputDir, ['/api/*', '/overlay/*'])).toThrow(
        'prevent cross-origin framing'
      );
    } finally {
      rmSync(outputDir, { force: true, recursive: true });
    }
  });
  it.each([
    ['catch-all policy', "/*\n  Content-Security-Policy: frame-ancestors 'self'\n", true],
    [
      'catch-all with other directives',
      "# comment\n/*\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'self'; frame-ancestors 'none'\n",
      true,
    ],
    [
      'policy only on a sub-route',
      "/other/*\n  Content-Security-Policy: frame-ancestors 'self'\n",
      false,
    ],
    [
      'catch-all widened by another block',
      "/*\n  Content-Security-Policy: frame-ancestors *\n/other/*\n  Content-Security-Policy: frame-ancestors 'self'\n",
      false,
    ],
    [
      'same-origin catch-all widened for a sub-route',
      "/*\n  Content-Security-Policy: frame-ancestors 'self'\n/embed/*\n  Content-Security-Policy: frame-ancestors https://example.com\n",
      false,
    ],
    ['directive text outside a header', "/*\n  X-Note: frame-ancestors 'self'\n", false],
  ])('evaluates the effective Pages framing policy: %s', (_name, source, expected) => {
    expect(pagesHeadersPreventFraming(source)).toBe(expected);
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
    expect(appCsp).toContain("frame-ancestors 'self'");
    expect(overlayCsp).toContain("default-src 'none'");
    expect(overlayCsp).toContain("script-src 'unsafe-inline'");
    expect(overlayCsp).toContain("frame-ancestors 'self'");
    expect(overlayCsp).not.toBe(appCsp);
  });
});
