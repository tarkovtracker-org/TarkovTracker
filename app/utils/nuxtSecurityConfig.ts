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
  const headers = readFileSync(resolve(outputDir, '_headers'), 'utf8');
  if (!pagesHeadersPreventFraming(headers)) {
    throw new Error('[Config] Cloudflare Pages output must prevent cross-origin framing.');
  }
};
type PagesHeaderBlock = { pattern: string; headers: string[] };
/** Cloudflare Pages `_headers`: an unindented URL pattern followed by indented header lines. */
const parsePagesHeaderBlocks = (source: string): PagesHeaderBlock[] => {
  const blocks: PagesHeaderBlock[] = [];
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (/^\s/.test(line)) blocks.at(-1)?.headers.push(line.trim());
    else blocks.push({ pattern: line.trim(), headers: [] });
  }
  return blocks;
};
const SAME_ORIGIN_FRAME_ANCESTORS = new Set(["'self'", "'none'"]);
const frameAncestorsOf = (header: string): string | null => {
  const match = /^content-security-policy:(.*)$/i.exec(header);
  const directive = match?.[1]
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.split(/\s+/)[0]?.toLowerCase() === 'frame-ancestors');
  return directive ? directive.slice('frame-ancestors'.length).trim() : null;
};
const removesContentSecurityPolicy = (header: string): boolean =>
  /^!\s*content-security-policy\s*$/i.test(header);
/**
 * The catch-all block must set a same-origin `frame-ancestors`, and no block may widen it or
 * remove the inherited policy, because Pages applies every matching block to a response.
 */
export const pagesHeadersPreventFraming = (source: string): boolean => {
  const blocks = parsePagesHeaderBlocks(source);
  const headers = blocks.flatMap((block) =>
    block.headers.map((header) => ({ pattern: block.pattern, header }))
  );
  const framing = headers
    .map(({ pattern, header }) => ({ pattern, value: frameAncestorsOf(header) }))
    .filter((policy) => policy.value !== null);
  return (
    !headers.some(({ header }) => removesContentSecurityPolicy(header)) &&
    framing.some((policy) => policy.pattern === '/*') &&
    framing.every((policy) => SAME_ORIGIN_FRAME_ANCESTORS.has(policy.value!))
  );
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
