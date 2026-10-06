import { createRouteSeoHead } from './routeSeo';
const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
};
const decodeAttribute = (value: string): string =>
  value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_match, entity: string) =>
    entity.startsWith('#')
      ? String.fromCodePoint(Number(entity.replace(/^#x/i, '0x').replace(/^#/, '')))
      : HTML_ENTITIES[entity.toLowerCase()]!
  );
const readTag = (tag: string): [string, string] => {
  const attributes = Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((match) => [
      match[1],
      match[2] ?? match[3],
    ])
  );
  return [
    attributes.name ?? attributes.property ?? '',
    attributes.content ?? attributes.value ?? '',
  ];
};
const readHeadTags = (html: string, route: string): Map<string, string[]> => {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  if (head === undefined) throw new Error(`[SEO] Missing HTML head: ${route}`);
  const tags = new Map<string, string[]>();
  for (const [tag] of head.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const [key, content] = readTag(tag);
    tags.set(key, [...(tags.get(key) ?? []), decodeAttribute(content)]);
  }
  return tags;
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
