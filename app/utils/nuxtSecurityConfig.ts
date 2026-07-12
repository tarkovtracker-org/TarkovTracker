import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildAppContentSecurityPolicy,
  buildOverlayContentSecurityPolicy,
  type ContentSecurityPolicyOptions,
} from './csp';
export type AppContentSecurityPolicyOptions = Omit<
  ContentSecurityPolicyOptions,
  'allowUnsafeInlineScripts'
>;
export type RouteRule = {
  headers: Record<string, string>;
};
export const DEFAULT_NITRO_PRESET = 'cloudflare-pages';
export const resolveNitroPreset = (configuredPreset?: string): string => {
  return configuredPreset?.trim() || DEFAULT_NITRO_PRESET;
};
export const promoteSpaFallback = (publicDir: string): void => {
  const fallbackPath = resolve(publicDir, '200.html');
  if (!existsSync(fallbackPath)) return;
  copyFileSync(fallbackPath, resolve(publicDir, 'index.html'));
  rmSync(fallbackPath);
};
export const assertCloudflarePagesOutput = (
  outputDir: string,
  expectedIncludes: string[]
): void => {
  const routes = JSON.parse(readFileSync(resolve(outputDir, '_routes.json'), 'utf8')) as {
    include?: unknown;
  };
  const include = Array.isArray(routes.include) ? routes.include : [];
  if (!expectedIncludes.every((route) => include.includes(route)) || include.includes('/*')) {
    throw new Error(`[Config] Unexpected Cloudflare Pages routes: ${JSON.stringify(include)}`);
  }
  if (readFileSync(resolve(outputDir, 'index.html'), 'utf8').length === 0) {
    throw new Error('[Config] Static SPA entrypoint is empty.');
  }
};
export const buildContentSecurityPolicyRouteRules = (
  options: AppContentSecurityPolicyOptions
): Record<'/**' | '/overlay/kappa/**', RouteRule> => {
  return {
    '/**': {
      headers: {
        'Content-Security-Policy': buildAppContentSecurityPolicy(options),
      },
    },
    '/overlay/kappa/**': {
      headers: {
        'Content-Security-Policy': buildOverlayContentSecurityPolicy({
          allowUnsafeInlineScripts: true,
        }),
      },
    },
  };
};
