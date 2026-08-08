import { describe, expect, it } from 'vitest';
import {
  GITHUB_IMAGE_DOMAINS,
  isPrimaryAppHostname,
  isPagesPreviewHostname,
  resolveClientLogSinkUrl,
  resolvePublicAppUrl,
  resolveSupabaseRuntimeConfig,
  shouldEnableAnalyticsIntegrations,
  shouldUseOfflineSupabaseFallback,
  TARKOV_IMAGE_DOMAINS,
} from '@/utils/runtimeConfig';
describe('resolveSupabaseRuntimeConfig', () => {
  it('resolves shared Supabase env values', () => {
    const config = resolveSupabaseRuntimeConfig({
      SUPABASE_ANON_KEY: 'shared-anon-key',
      SUPABASE_URL: 'https://shared.supabase.co',
    });
    expect(config.privateUrl).toBe('https://shared.supabase.co');
    expect(config.privateAnonKey).toBe('shared-anon-key');
    expect(config.publicUrl).toBe('https://shared.supabase.co');
    expect(config.publicAnonKey).toBe('shared-anon-key');
  });
  it('supports legacy Nuxt public names during migration', () => {
    const config = resolveSupabaseRuntimeConfig({
      NUXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy-nuxt-anon-key',
      NUXT_PUBLIC_SUPABASE_URL: 'https://legacy-nuxt.supabase.co',
    });
    expect(config.privateUrl).toBe('https://legacy-nuxt.supabase.co');
    expect(config.privateAnonKey).toBe('legacy-nuxt-anon-key');
    expect(config.publicUrl).toBe('https://legacy-nuxt.supabase.co');
    expect(config.publicAnonKey).toBe('legacy-nuxt-anon-key');
  });
  it('supports legacy Vite names during migration', () => {
    const config = resolveSupabaseRuntimeConfig({
      VITE_SUPABASE_ANON_KEY: 'legacy-vite-anon-key',
      VITE_SUPABASE_URL: 'https://legacy-vite.supabase.co',
    });
    expect(config.privateUrl).toBe('https://legacy-vite.supabase.co');
    expect(config.privateAnonKey).toBe('legacy-vite-anon-key');
    expect(config.publicUrl).toBe('https://legacy-vite.supabase.co');
    expect(config.publicAnonKey).toBe('legacy-vite-anon-key');
  });
  it('ignores blank higher-priority values when a complete fallback exists', () => {
    const config = resolveSupabaseRuntimeConfig({
      NUXT_PUBLIC_SUPABASE_ANON_KEY: ' ',
      NUXT_PUBLIC_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: 'legacy-vite-anon-key',
      VITE_SUPABASE_URL: 'https://legacy-vite.supabase.co',
    });
    expect(config.privateUrl).toBe('https://legacy-vite.supabase.co');
    expect(config.privateAnonKey).toBe('legacy-vite-anon-key');
    expect(config.publicUrl).toBe('https://legacy-vite.supabase.co');
    expect(config.publicAnonKey).toBe('legacy-vite-anon-key');
  });
  it('rejects partial credentials when no complete pair exists', () => {
    expect(() =>
      resolveSupabaseRuntimeConfig({
        SUPABASE_ANON_KEY: 'shared-anon-key',
      })
    ).toThrow('[Config] Incomplete Supabase credentials: SUPABASE_*');
  });
  it('rejects a partial canonical pair before using legacy credentials', () => {
    expect(() =>
      resolveSupabaseRuntimeConfig({
        NUXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy-nuxt-anon-key',
        NUXT_PUBLIC_SUPABASE_URL: 'https://legacy-nuxt.supabase.co',
        SUPABASE_URL: 'https://shared.supabase.co',
      })
    ).toThrow('[Config] Incomplete Supabase credentials: SUPABASE_*');
  });
  it('prefers a complete canonical pair over stray legacy values', () => {
    const config = resolveSupabaseRuntimeConfig({
      NUXT_PUBLIC_SUPABASE_URL: 'https://legacy-nuxt.supabase.co',
      SUPABASE_ANON_KEY: 'shared-anon-key',
      SUPABASE_URL: 'https://shared.supabase.co',
    });
    expect(config.publicUrl).toBe('https://shared.supabase.co');
    expect(config.publicAnonKey).toBe('shared-anon-key');
  });
  it('prefers canonical credentials when complete legacy pairs differ', () => {
    const config = resolveSupabaseRuntimeConfig({
      NUXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy-nuxt-anon-key',
      NUXT_PUBLIC_SUPABASE_URL: 'https://legacy-nuxt.supabase.co',
      SUPABASE_ANON_KEY: 'shared-anon-key',
      SUPABASE_URL: 'https://shared.supabase.co',
    });
    expect(config.publicUrl).toBe('https://shared.supabase.co');
    expect(config.publicAnonKey).toBe('shared-anon-key');
  });
  it('includes Tarkov asset hosts alongside GitHub image hosts', () => {
    expect([...GITHUB_IMAGE_DOMAINS, ...TARKOV_IMAGE_DOMAINS]).toEqual(
      expect.arrayContaining(['assets.tarkov.dev', 'avatars.githubusercontent.com', 'github.com'])
    );
  });
});
describe('resolveClientLogSinkUrl', () => {
  it('disables browser log forwarding unless a sink is explicitly configured', () => {
    expect(resolveClientLogSinkUrl({})).toBe('');
    expect(resolveClientLogSinkUrl({ NUXT_PUBLIC_CLIENT_LOG_SINK_URL: '  ' })).toBe('');
    expect(resolveClientLogSinkUrl({ NUXT_PUBLIC_CLIENT_LOG_SINK_URL: ' /api/logs/client ' })).toBe(
      '/api/logs/client'
    );
  });
});
describe('resolvePublicAppUrl', () => {
  it('prefers NUXT_PUBLIC_APP_URL as canonical', () => {
    expect(
      resolvePublicAppUrl({
        APP_URL: 'https://platform.example.com',
        NUXT_PUBLIC_APP_URL: 'https://canonical.example.com',
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
