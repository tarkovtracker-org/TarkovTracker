import { describe, expect, it } from 'vitest';
import {
  buildAppContentSecurityPolicy,
  buildContentSecurityPolicy,
  buildOverlayContentSecurityPolicy,
  getConnectSrcSources,
  getImgSrcSources,
} from '@/utils/csp';
const getDirectiveSources = (csp: string, directive: string): string[] => {
  const entry = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${directive} `));
  if (!entry) {
    return [];
  }
  return entry
    .slice(directive.length + 1)
    .split(/\s+/)
    .filter(Boolean);
};
describe('nuxt.config CSP', () => {
  it('includes runtime backend origins in connect-src', () => {
    const connectSources = getConnectSrcSources({
      clientLogSinkUrl: 'https://logs.example.com/v1/collect',
      supabaseUrl: 'https://db.example.com/auth/v1',
    });
    expect(connectSources).toContain('https://assets.tarkov.dev');
    expect(connectSources).toContain('https://tarkovtracker.github.io');
    expect(connectSources).toContain('https://logs.example.com');
    expect(connectSources).toContain('https://db.example.com');
    expect(connectSources).toContain('wss://db.example.com');
    expect(connectSources).not.toContain('https://logs.example.com/v1/collect');
    expect(connectSources).not.toContain('https://db.example.com/auth/v1');
  });
  it('limits insecure websocket origins to local http backends', () => {
    const remoteSources = getConnectSrcSources({
      supabaseUrl: 'http://db.example.com/auth/v1',
    });
    const localSources = getConnectSrcSources({
      supabaseUrl: 'http://localhost:54321/auth/v1',
    });
    const ipv6Sources = getConnectSrcSources({
      supabaseUrl: 'http://[::1]:54321/auth/v1',
    });
    expect(remoteSources).toContain('http://db.example.com');
    expect(remoteSources).not.toContain('ws://db.example.com');
    expect(localSources).toContain('http://localhost:54321');
    expect(localSources).toContain('ws://localhost:54321');
    expect(ipv6Sources).toContain('http://[::1]:54321');
    expect(ipv6Sources).toContain('ws://[::1]:54321');
  });
  it('allows remote https images for oauth avatars and map fallbacks', () => {
    const imageSources = getImgSrcSources();
    expect(imageSources).toContain('https:');
  });
  it('builds an app policy that preserves Nuxt bootstrap scripts', () => {
    const csp = buildAppContentSecurityPolicy({
      clientLogSinkUrl: 'https://logs.example.com/v1/collect',
      clarityInstrumentationKey: 'abcdef1234',
      gaMeasurementId: 'G-ABCDEF1234',
      supabaseUrl: 'https://db.example.com/auth/v1',
    });
    expect(getDirectiveSources(csp, 'default-src')).toEqual(["'self'"]);
    expect(getDirectiveSources(csp, 'script-src')).toContain("'unsafe-inline'");
    expect(getDirectiveSources(csp, 'script-src')).toContain(
      'https://static.cloudflareinsights.com'
    );
    expect(getDirectiveSources(csp, 'script-src')).toContain('https://*.googletagmanager.com');
    expect(getDirectiveSources(csp, 'script-src')).toContain('https://*.clarity.ms');
    expect(getDirectiveSources(csp, 'connect-src')).toContain('https://cloudflareinsights.com');
    expect(getDirectiveSources(csp, 'connect-src')).toContain('https://db.example.com');
    expect(getDirectiveSources(csp, 'img-src')).toContain('https:');
    expect(getDirectiveSources(csp, 'style-src')).toEqual([
      "'self'",
      "'unsafe-inline'",
      'https://fonts.googleapis.com',
    ]);
    expect(getDirectiveSources(csp, 'font-src')).toEqual([
      "'self'",
      'data:',
      'https://fonts.gstatic.com',
    ]);
    expect(getDirectiveSources(csp, 'worker-src')).toContain('blob:');
    expect(getDirectiveSources(csp, 'worker-src')).toContain("'self'");
  });
  it('allows unsafe-inline scripts only when explicitly enabled', () => {
    const csp = buildContentSecurityPolicy({ allowUnsafeInlineScripts: true });
    expect(getDirectiveSources(csp, 'script-src')).toContain("'unsafe-inline'");
  });
  it('builds a stricter overlay policy and requires explicit inline bootstrap opt-in', () => {
    const csp = buildOverlayContentSecurityPolicy();
    expect(getDirectiveSources(csp, 'default-src')).toEqual(["'none'"]);
    expect(getDirectiveSources(csp, 'script-src')).toEqual(["'none'"]);
    expect(getDirectiveSources(csp, 'connect-src')).toEqual(["'self'"]);
    expect(getDirectiveSources(csp, 'style-src')).toContain('https://fonts.googleapis.com');
    expect(getDirectiveSources(csp, 'font-src')).toContain('https://fonts.gstatic.com');
    expect(getDirectiveSources(csp, 'frame-ancestors')).toEqual(["'self'"]);
    const inlineCsp = buildOverlayContentSecurityPolicy({ allowUnsafeInlineScripts: true });
    expect(getDirectiveSources(inlineCsp, 'script-src')).toEqual(["'unsafe-inline'"]);
  });
});
