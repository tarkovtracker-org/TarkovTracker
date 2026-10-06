// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as routeSeo from '@/utils/routeSeo';
import { assertLinkPreviewMetadata } from '@/utils/linkPreview';
import { CLIENT_DOCUMENT_ROUTES, PUBLIC_SEO_ROUTES, createRouteSeoHead } from '@/utils/routeSeo';
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
const documentFor = (route: string) => {
  const meta = createRouteSeoHead(route).meta.map((tag) => {
    const key = 'property' in tag ? `property="${tag.property}"` : `name="${tag.name}"`;
    return `<meta ${key} content="${escape(tag.content)}">`;
  });
  return `<html><head><meta name="theme-color" content="#c8a882">${meta.join('')}</head><body></body></html>`;
};
describe('initial HTML link previews', () => {
  it.each([...PUBLIC_SEO_ROUTES, ...CLIENT_DOCUMENT_ROUTES])('validates %s', (route) => {
    expect(() => assertLinkPreviewMetadata(documentFor(route), route)).not.toThrow();
  });
  it.each([
    ['missing title', (html: string) => html.replace(/<meta property="og:title"[^>]*>/, '')],
    [
      'wrong title',
      (html: string) => html.replace(/(property="og:title" content=")[^"]*/, '$1Wrong page'),
    ],
    [
      'duplicate title',
      (html: string) =>
        html.replace('<head>', '<head><meta property="og:title" content="Stale title">'),
    ],
    [
      'body-only title',
      (html: string) =>
        html
          .replace(/(<meta property="og:title"[^>]*>)/, '')
          .replace(
            '<body>',
            `<body><meta property="og:title" content="${escape(createRouteSeoHead('/tasks').title)}">`
          ),
    ],
    [
      'missing description',
      (html: string) => html.replace(/<meta property="og:description"[^>]*>/, ''),
    ],
    [
      'wrong canonical',
      (html: string) =>
        html.replace(/(property="og:url" content=")[^"]*/, '$1https://tarkovtracker.org/'),
    ],
    [
      'wrong layout',
      (html: string) => html.replace('content="summary"', 'content="summary_large_image"'),
    ],
    [
      'unexpected image',
      (html: string) =>
        html.replace(
          '</head>',
          '<meta property="og:image" content="https://example.com/stale.png"></head>'
        ),
    ],
    ['invalid color', (html: string) => html.replace('#c8a882', 'tan')],
    [
      'duplicate color',
      (html: string) => html.replace('<head>', '<head><meta name="theme-color" content="#000000">'),
    ],
    ['missing head', (html: string) => html.replace(/<\/?head>/g, '')],
  ])('rejects %s', (_label, mutate) => {
    expect(() => assertLinkPreviewMetadata(mutate(documentFor('/tasks')), '/tasks')).toThrow(
      '[SEO]'
    );
  });
  it('accepts reordered attributes and single-quoted values', () => {
    const html = documentFor('/kappa').replace(
      /<meta ([^>]+) content="([^"]*)">/g,
      "<meta content='$2' $1>"
    );
    expect(() => assertLinkPreviewMetadata(html, '/kappa')).not.toThrow();
  });
  it.each(['&amp;', '&', '&#38;', '&#x26;'])(
    'accepts equivalent ampersand encoding %s',
    (ampersand) => {
      const html = documentFor('/kappa').replaceAll('&amp;', ampersand);
      expect(() => assertLinkPreviewMetadata(html, '/kappa')).not.toThrow();
    }
  );
  it('keeps query strings and player identifiers out of profile preview metadata', () => {
    const route = '/profile/11111111-1111-4111-8111-111111111111/pve?token=private';
    const html = documentFor(route);
    expect(html).not.toContain('11111111');
    expect(html).not.toContain('private');
    expect(html).not.toContain('og:url');
    expect(() => assertLinkPreviewMetadata(html, route)).not.toThrow();
  });
  it.each([
    ['title', 'é'.repeat(36), '70'],
    ['description', 'é'.repeat(176), '350'],
  ] as const)(
    'rejects oversized UTF-8 %s even when its character count fits',
    (key, value, limit) => {
      const original = routeSeo.createRouteSeoHead;
      const mock = vi.spyOn(routeSeo, 'createRouteSeoHead').mockImplementation((route) => {
        const head = original(route);
        head.meta = head.meta.map((tag) =>
          tag.key === `og:${key}` ? { ...tag, content: value } : tag
        );
        return head;
      });
      try {
        expect(() => assertLinkPreviewMetadata(documentFor('/tasks'), '/tasks')).toThrow(
          `exceeds ${limit} bytes`
        );
      } finally {
        mock.mockRestore();
      }
    }
  );
});
