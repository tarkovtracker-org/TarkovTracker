import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLIENT_DOCUMENT_ROUTES, PUBLIC_SEO_ROUTES, resolveRouteSeo, SEO_ORIGIN } from './routeSeo';
const readDocument = (directory: string, route: string): string => {
  const relative = route === '/' ? 'index.html' : `${route.slice(1)}.html`;
  const file = resolve(directory, relative);
  if (!existsSync(file)) throw new Error(`[SEO] Missing required document: ${route}`);
  return readFileSync(file, 'utf8');
};
const escapeAttribute = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
const requireToken = (html: string, token: string, label: string, route: string): void => {
  if (!html.includes(token)) throw new Error(`[SEO] Incorrect ${label}: ${route}`);
};
const assertCanonical = (html: string, route: string): void => {
  const { canonical } = resolveRouteSeo(route);
  const canonicals = [...html.matchAll(/<link[^>]+rel="canonical"[^>]*>/g)].map(
    (match) => match[0]
  );
  if (canonicals.length !== Number(Boolean(canonical))) {
    throw new Error(`[SEO] Incorrect canonical count: ${route}`);
  }
  if (canonical) requireToken(canonicals[0]!, `href="${canonical}"`, 'canonical URL', route);
};
const assertDocumentMetadata = (html: string, route: string): void => {
  const seo = resolveRouteSeo(route);
  requireToken(html, `<title>${escapeAttribute(seo.title)}</title>`, 'initial title', route);
  requireToken(
    html,
    `name="description" content="${escapeAttribute(seo.description)}"`,
    'initial description',
    route
  );
  assertCanonical(html, route);
};
const assertImagePolicy = (html: string, route: string): void => {
  if (!resolveRouteSeo(route).image && /(?:property="og:image"|name="twitter:image")/.test(html)) {
    throw new Error(`[SEO] Unexpected social image: ${route}`);
  }
};
const assertDocumentRendering = (html: string, route: string): void => {
  const { indexable } = resolveRouteSeo(route);
  if (indexable && !/<h1\b/.test(html)) throw new Error(`[SEO] Missing public heading: ${route}`);
  const robots = indexable ? 'index, follow' : 'noindex, nofollow';
  requireToken(html, `name="robots" content="${robots}"`, 'indexing directive', route);
  assertImagePolicy(html, route);
};
const assertSitemap = (directory: string): void => {
  const sitemap = readFileSync(resolve(directory, 'sitemap.xml'), 'utf8');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]).sort();
  const expected = PUBLIC_SEO_ROUTES.map((route) => `${SEO_ORIGIN}${route}`).sort();
  if (JSON.stringify(urls) !== JSON.stringify(expected) || sitemap.includes('<lastmod>')) {
    throw new Error(
      '[SEO] Sitemap must contain only canonical public routes, without invented dates.'
    );
  }
};
const assertRedirects = (directory: string): void => {
  const redirects = readFileSync(resolve(directory, '_redirects'), 'utf8');
  requireToken(redirects, '/neededitems /needed-items 301', 'legacy redirect', '/neededitems');
  requireToken(
    redirects,
    '/streamer-tools /settings#streamer-tools 301',
    'legacy redirect',
    '/streamer-tools'
  );
  if (/^\s*\/\*\s+.*\s+200\s*$/m.test(redirects) || /\s404\s*$/m.test(redirects)) {
    throw new Error(
      '[SEO] Pages redirects must not rewrite unknown routes or invent 404 rewrites.'
    );
  }
};
/** A build is incomplete if any required public page or private shell is missing or generic. */
export const assertPrerenderedDocuments = (directory: string): void => {
  for (const route of [...PUBLIC_SEO_ROUTES, ...CLIENT_DOCUMENT_ROUTES]) {
    const html = readDocument(directory, route);
    assertDocumentMetadata(html, route);
    assertDocumentRendering(html, route);
  }
  const notFound = readFileSync(resolve(directory, '404.html'), 'utf8');
  requireToken(
    notFound,
    'name="robots" content="noindex, nofollow"',
    '404 indexing directive',
    '/404.html'
  );
  requireToken(notFound, '<h1', '404 heading', '/404.html');
  assertSitemap(directory);
  assertRedirects(directory);
};
