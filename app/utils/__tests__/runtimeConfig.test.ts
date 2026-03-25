import { describe, expect, it } from 'vitest';
import {
  GITHUB_IMAGE_DOMAINS,
  isPagesPreviewHostname,
  resolvePublicAppUrl,
  resolveSupabaseRuntimeConfig,
  shouldUseOfflineSupabaseFallback,
  TARKOV_IMAGE_DOMAINS,
} from '@/utils/runtimeConfig';
describe('resolveSupabaseRuntimeConfig', () => {
  it('falls back to public Supabase env values for private runtime config', () => {
    const config = resolveSupabaseRuntimeConfig({
      NUXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
      NUXT_PUBLIC_SUPABASE_URL: 'https://public.supabase.co',
    });
    expect(config.privateUrl).toBe('https://public.supabase.co');
    expect(config.privateAnonKey).toBe('public-anon-key');
    expect(config.publicUrl).toBe('https://public.supabase.co');
    expect(config.publicAnonKey).toBe('public-anon-key');
  });
  it('includes Tarkov asset hosts alongside GitHub image hosts', () => {
    expect([...GITHUB_IMAGE_DOMAINS, ...TARKOV_IMAGE_DOMAINS]).toEqual(
      expect.arrayContaining(['assets.tarkov.dev', 'avatars.githubusercontent.com', 'github.com'])
    );
  });
});
describe('resolvePublicAppUrl', () => {
  it('prefers explicit public app url', () => {
    expect(
      resolvePublicAppUrl({
        NUXT_PUBLIC_APP_URL: 'https://preview.example.com',
      })
    ).toBe('https://preview.example.com');
  });
  it('falls back to the current Cloudflare Pages deployment url', () => {
    expect(
      resolvePublicAppUrl({
        CF_PAGES_URL: 'deploy-preview.pages.dev',
      })
    ).toBe('https://deploy-preview.pages.dev');
  });
  it('falls back to localhost when no deployment url exists', () => {
    expect(resolvePublicAppUrl({})).toBe('http://localhost:3000');
  });
});
describe('shouldUseOfflineSupabaseFallback', () => {
  it('allows offline fallback outside production', () => {
    expect(
      shouldUseOfflineSupabaseFallback({
        hostname: 'tarkovtracker.org',
        isProduction: false,
      })
    ).toBe(true);
  });
  it('allows offline fallback on Cloudflare preview hosts', () => {
    expect(
      shouldUseOfflineSupabaseFallback({
        hostname: 'feature-branch.tarkovtrackernuxt.pages.dev',
        isProduction: true,
      })
    ).toBe(true);
    expect(isPagesPreviewHostname('feature-branch.tarkovtrackernuxt.pages.dev')).toBe(true);
  });
  it('keeps production strict on primary hosts', () => {
    expect(
      shouldUseOfflineSupabaseFallback({
        hostname: 'tarkovtracker.org',
        isProduction: true,
      })
    ).toBe(false);
  });
});
