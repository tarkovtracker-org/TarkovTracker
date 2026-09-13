// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, expect, it, vi } from 'vitest';
import { recordProviderInitiation } from '@/server/utils/providerInitiation';
import type { H3Event } from 'h3';
mockNuxtImport('useRuntimeConfig', () => () => ({
  supabaseServiceKey: 'synthetic-service-key',
  supabaseUrl: 'https://synthetic.invalid',
}));
afterEach(() => vi.unstubAllGlobals());
it('sanitizes transport failures into retryable service unavailability', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private transport detail')));
  await expect(
    recordProviderInitiation({} as H3Event, 'synthetic', 'synthetic')
  ).rejects.toMatchObject({
    statusCode: 503,
    message: 'Provider lifecycle unavailable',
  });
});
