import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import {
  CLIENT_DOCUMENT_ROUTES,
  PUBLIC_SEO_ROUTES,
  createRouteSeoHead,
  resolveRouteSeo,
  SEO_ORIGIN,
} from './routeSeo';
const findElement = (nodes: DefaultTreeAdapterMap['childNode'][], tagName: string) =>
  nodes.find(
    (node): node is DefaultTreeAdapterMap['element'] =>
      'tagName' in node && node.tagName === tagName
  );
const headChildren = (html: string, route: string) => {
  if (!/<head\b/i.test(html)) throw new Error(`[SEO] Missing HTML head: ${route}`);
  // The HTML parser always creates an html element containing a head element.
  const root = findElement(parse(html).childNodes, 'html')!;
  return findElement(root.childNodes, 'head')!.childNodes;
};
const isMetaNode = (
  node: DefaultTreeAdapterMap['childNode']
): node is DefaultTreeAdapterMap['element'] => 'tagName' in node && node.tagName === 'meta';
const readHeadTags = (html: string, route: string): Map<string, string[]> => {
  const tags = new Map<string, string[]>();
  for (const node of headChildren(html, route).filter(isMetaNode)) collectMetaTag(tags, node);
  return tags;
};
const collectMetaTag = (tags: Map<string, string[]>, node: DefaultTreeAdapterMap['element']) => {
  const attributes = Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]));
  const key = attributes.name ?? attributes.property ?? '';
  const content = attributes.content ?? attributes.value ?? '';
  tags.set(key, [...(tags.get(key) ?? []), content]);
};
const assertSingleTag = (
  tags: Map<string, string[]>,
  key: string,
  content: string,
  route: string
) => {
  const values = tags.get(key);
  if (values?.length !== 1 || values[0] !== content) {
    throw new Error(`[SEO] Incorrect link preview tag ${key}: ${route}`);
  }
};
const assertCopyLimits = (route: string): void => {
  for (const [key, limit] of [
    ['og:title', 70],
    ['og:description', 350],
  ] as const) {
    // Measure decoded copy, not HTML entities; Discord's limits count UTF-8 bytes.
    const tag = createRouteSeoHead(route).meta.find(
      (tag) => 'property' in tag && tag.property === key
    );
    if (!tag || new TextEncoder().encode(tag.content).length > limit) {
      throw new Error(`[SEO] Link preview ${key} exceeds ${limit} bytes: ${route}`);
    }
  }
};
const assertAccentColor = (tags: Map<string, string[]>, route: string): void => {
  const colors = tags.get('theme-color');
  if (colors?.length !== 1 || !/^#[\da-fA-F]{6}(?:[\da-fA-F]{2})?$/.test(colors[0]!)) {
    throw new Error(`[SEO] Incorrect link preview accent color: ${route}`);
  }
};
const isSocialKey = (key: string): boolean => key.startsWith('og:') || key.startsWith('twitter:');
const assertExpectedTags = (tags: Map<string, string[]>, route: string): void => {
  for (const tag of createRouteSeoHead(route).meta) {
    if (isSocialKey(tag.key!)) assertSingleTag(tags, tag.key!, tag.content, route);
  }
};
const assertUnexpectedTags = (tags: Map<string, string[]>, route: string): void => {
  const expectedKeys = new Set(createRouteSeoHead(route).meta.map((tag) => tag.key));
  for (const key of tags.keys()) {
    if (isSocialKey(key) && !expectedKeys.has(key)) {
      throw new Error(`[SEO] Unexpected link preview tag ${key}: ${route}`);
    }
  }
};
/** Discord reads the initial HTML; duplicate tags can silently select stale page metadata. */
export const assertLinkPreviewMetadata = (html: string, route: string): void => {
  const tags = readHeadTags(html, route);
  assertExpectedTags(tags, route);
  assertUnexpectedTags(tags, route);
  assertCopyLimits(route);
  assertAccentColor(tags, route);
};
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
  assertLinkPreviewMetadata(html, route);
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
const assertInlinePayload = (html: string, route: string): void => {
  if (/<(?:link|script)\b[^>]*_payload\.json/.test(html)) {
    throw new Error(`[SEO] Prerendered payload must be inline: ${route}`);
  }
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
    assertInlinePayload(html, route);
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
