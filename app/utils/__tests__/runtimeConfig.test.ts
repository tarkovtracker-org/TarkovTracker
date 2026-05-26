import { describe, expect, it } from 'vitest';
import {
  GITHUB_IMAGE_DOMAINS,
  isPrimaryAppHostname,
  isPagesPreviewHostname,
  resolvePublicAppUrl,
  resolveSupabaseRuntimeConfig,
  shouldEnableAnalyticsIntegrations,
  shouldUseOfflineSupabaseFallback,
  TARKOV_IMAGE_DOMAINS,
} from '@/utils/runtimeConfig';
describe('resolveSupabaseRuntimeConfig', () => {
  it('resolves Supabase env values', () => {
    const config = resolveSupabaseRuntimeConfig({
      SUPABASE_ANON_KEY: 'public-anon-key',
      SUPABASE_URL: 'https://public.supabase.co',
    });
    expect(config.privateUrl).toBe('https://public.supabase.co');
    expect(config.privateAnonKey).toBe('public-anon-key');
    expect(config.publicUrl).toBe('https://public.supabase.co');
    expect(config.publicAnonKey).toBe('public-anon-key');
  });
  it('resolves Supabase env values from canonical names', () => {
    const config = resolveSupabaseRuntimeConfig({
      NUXT_PUBLIC_SUPABASE_ANON_KEY: 'nuxt-public-anon-key',
      NUXT_PUBLIC_SUPABASE_URL: 'https://nuxt-public.supabase.co',
    });
    expect(config.privateUrl).toBe('https://nuxt-public.supabase.co');
    expect(config.privateAnonKey).toBe('nuxt-public-anon-key');
    expect(config.publicUrl).toBe('https://nuxt-public.supabase.co');
    expect(config.publicAnonKey).toBe('nuxt-public-anon-key');
  });
  it('falls back to SUPABASE_URL / SUPABASE_ANON_KEY as platform convenience', () => {
    const config = resolveSupabaseRuntimeConfig({
      SUPABASE_ANON_KEY: 'platform-anon-key',
      SUPABASE_URL: 'https://platform.supabase.co',
    });
    expect(config.privateUrl).toBe('https://platform.supabase.co');
    expect(config.privateAnonKey).toBe('platform-anon-key');
    expect(config.publicUrl).toBe('https://platform.supabase.co');
    expect(config.publicAnonKey).toBe('platform-anon-key');
  });
  it('prefers NUXT_PUBLIC_* over SUPABASE_* for Nuxt runtime config', () => {
    const config = resolveSupabaseRuntimeConfig({
      NUXT_PUBLIC_SUPABASE_ANON_KEY: 'nuxt-anon-key',
      NUXT_PUBLIC_SUPABASE_URL: 'https://nuxt.supabase.co',
      SUPABASE_ANON_KEY: 'platform-anon-key',
      SUPABASE_URL: 'https://platform.supabase.co',
    });
    expect(config.privateUrl).toBe('https://nuxt.supabase.co');
    expect(config.privateAnonKey).toBe('nuxt-anon-key');
    expect(config.publicUrl).toBe('https://nuxt.supabase.co');
    expect(config.publicAnonKey).toBe('nuxt-anon-key');
  });
  it('includes Tarkov asset hosts alongside GitHub image hosts', () => {
    expect([...GITHUB_IMAGE_DOMAINS, ...TARKOV_IMAGE_DOMAINS]).toEqual(
      expect.arrayContaining(['assets.tarkov.dev', 'avatars.githubusercontent.com', 'github.com'])
    );
  });
});
describe('resolvePublicAppUrl', () => {
  it('prefers NUXT_PUBLIC_APP_URL as canonical', () => {
    expect(
      resolvePublicAppUrl({
        NUXT_PUBLIC_APP_URL: 'https://canonical.example.com',
        APP_URL: 'https://platform.example.com',
      })
    ).toBe('https://canonical.example.com');
  });
  it('falls back to APP_URL as platform convenience', () => {
    expect(
      resolvePublicAppUrl({
        APP_URL: 'https://platform.example.com',
      })
    ).toBe('https://platform.example.com');
  });
  it('falls back to the current Cloudflare Pages deployment url', () => {
    expect(
      resolvePublicAppUrl({
        CF_PAGES_URL: 'deploy-preview.pages.dev',
      })
    ).toBe('https://deploy-preview.pages.dev');
  });
  it('resolves NUXT_PUBLIC_APP_URL when set alone', () => {
    expect(
      resolvePublicAppUrl({
        NUXT_PUBLIC_APP_URL: 'https://legacy-preview.example.com',
      })
    ).toBe('https://legacy-preview.example.com');
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
describe('shouldEnableAnalyticsIntegrations', () => {
  it('disables analytics outside production', () => {
    expect(
      shouldEnableAnalyticsIntegrations({
        appUrl: 'https://tarkovtracker.org',
        hostname: 'tarkovtracker.org',
        isProduction: false,
      })
    ).toBe(false);
  });
  it('disables analytics on preview hosts', () => {
    expect(
      shouldEnableAnalyticsIntegrations({
        appUrl: 'https://feature-branch.tarkovtrackernuxt.pages.dev',
        hostname: 'feature-branch.tarkovtrackernuxt.pages.dev',
        isProduction: true,
      })
    ).toBe(false);
    expect(isPagesPreviewHostname('feature-branch.tarkovtrackernuxt.pages.dev')).toBe(true);
  });
  it('uses appUrl when hostname is unavailable', () => {
    expect(
      shouldEnableAnalyticsIntegrations({
        appUrl: 'https://tarkovtracker.org',
        isProduction: true,
      })
    ).toBe(true);
    expect(
      shouldEnableAnalyticsIntegrations({
        appUrl: 'https://preview.tarkovtrackernuxt.pages.dev',
        isProduction: true,
      })
    ).toBe(false);
  });
  it('disables analytics on non-primary production hosts', () => {
    expect(
      shouldEnableAnalyticsIntegrations({
        appUrl: 'https://preview.example.com',
        hostname: 'preview.example.com',
        isProduction: true,
      })
    ).toBe(false);
  });
  it('enables analytics on primary production hosts', () => {
    expect(
      shouldEnableAnalyticsIntegrations({
        appUrl: 'https://tarkovtracker.org',
        hostname: 'www.tarkovtracker.org',
        isProduction: true,
      })
    ).toBe(true);
    expect(isPrimaryAppHostname('tarkovtracker.org')).toBe(true);
    expect(isPrimaryAppHostname('www.tarkovtracker.org')).toBe(true);
  });
  it('normalizes bare hostnames with ports before checking primary hosts', () => {
    expect(
      shouldEnableAnalyticsIntegrations({
        hostname: 'tarkovtracker.org:443',
        isProduction: true,
      })
    ).toBe(true);
    expect(isPrimaryAppHostname('www.tarkovtracker.org:443')).toBe(true);
  });
});
