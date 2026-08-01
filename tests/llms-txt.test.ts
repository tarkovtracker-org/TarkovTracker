import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_SUPPORTED_LANGUAGES } from '@/utils/constants';
import { SUPPORTED_LOCALES } from '@/utils/locales';
const LLMS_TXT_PATH = join(process.cwd(), 'public', 'llms.txt');
const TARKOV_API_DIR = join(process.cwd(), 'app', 'server', 'api', 'tarkov');
const TOP_LEVEL_API_DIR = join(process.cwd(), 'app', 'server', 'api');
const llmsTxt = readFileSync(LLMS_TXT_PATH, 'utf8');
const HYPERLINK_RE = /^- \[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?$/;
const H1_RE = /^# (.+)$/;
const H2_RE = /^## (.+)$/;
const BLOCKQUOTE_RE = /^> (.*)$/;
type Section = { heading: string | null; lines: string[] };
const splitSections = (src: string): Section[] => {
  const sections: Section[] = [];
  let current: Section = { heading: null, lines: [] };
  for (const line of src.split('\n')) {
    if (H2_RE.test(line)) {
      if (current.lines.some((l) => l.trim())) sections.push(current);
      current = { heading: line.replace(/^## /, ''), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.some((l) => l.trim())) sections.push(current);
  return sections;
};
const nonEmptyLines = (src: string): string[] => src.split('\n').filter((l) => l.trim().length > 0);
const listItems = (section: Section): string[] =>
  section.lines.filter((l) => l.trim().startsWith('- '));
const parseLink = (line: string): { name: string; url: string; notes?: string } | null => {
  const match = line.trim().match(HYPERLINK_RE);
  if (!match) return null;
  return { name: match[1], url: match[2], notes: match[3] };
};
const getHandlers = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.get.ts'))
    .map((d) => d.name.replace(/\.get\.ts$/, ''));
describe('public/llms.txt', () => {
  it('starts with an H1 project name', () => {
    const lines = nonEmptyLines(llmsTxt);
    expect(lines[0]).toMatch(H1_RE);
    expect(lines[0]).toBe('# TarkovTracker');
  });
  it('has a blockquote summary immediately after the H1', () => {
    const lines = nonEmptyLines(llmsTxt);
    expect(lines[1]).toMatch(BLOCKQUOTE_RE);
    expect(lines[1].length).toBeGreaterThan(20);
  });
  it('keeps the Optional section last', () => {
    const sections = splitSections(llmsTxt);
    expect(sections.at(-1)?.heading).toBe('Optional');
  });
  it('every H2 section list item is a valid hyperlink with optional notes', () => {
    const sections = splitSections(llmsTxt);
    for (const section of sections) {
      if (section.heading === null) continue;
      const items = listItems(section);
      expect(items.length, `section "${section.heading}" has no list items`).toBeGreaterThan(0);
      for (const item of items) {
        const parsed = parseLink(item);
        expect(parsed, `unparseable list item: ${item}`).not.toBeNull();
        expect(parsed?.name.length, `empty link name: ${item}`).toBeGreaterThan(0);
        expect(parsed?.url.length, `empty url: ${item}`).toBeGreaterThan(0);
      }
    }
  });
  it('every linked URL is absolute https', () => {
    const sections = splitSections(llmsTxt);
    for (const section of sections) {
      for (const item of listItems(section)) {
        const parsed = parseLink(item);
        expect(parsed, `unparseable list item: ${item}`).not.toBeNull();
        expect(parsed?.url, `non-https url: ${parsed?.url}`).toMatch(/^https:\/\//);
      }
    }
  });
  it('declares every supported UI locale', () => {
    const localeLine = nonEmptyLines(llmsTxt).find((l) => l.startsWith('UI locales'));
    expect(localeLine, 'missing UI locales line').toBeDefined();
    for (const locale of SUPPORTED_LOCALES) {
      expect(localeLine, `locale "${locale}" missing from llms.txt`).toContain(`\`${locale}\``);
    }
  });
  it('declares every API-supported language', () => {
    const langLine = nonEmptyLines(llmsTxt).find((l) => l.includes('Supported `lang` values:'));
    expect(langLine, 'missing API lang line').toBeDefined();
    for (const lang of API_SUPPORTED_LANGUAGES) {
      expect(langLine, `API lang "${lang}" missing from llms.txt`).toContain(`\`${lang}\``);
    }
  });
  it('lists /profile among auth-required areas', () => {
    const authLine = nonEmptyLines(llmsTxt).find((l) =>
      l.startsWith('Authentication-required areas')
    );
    expect(authLine, 'missing auth-required note').toBeDefined();
    expect(authLine).toContain('/profile');
    expect(authLine).toContain('/account');
    expect(authLine).toContain('/team');
    expect(authLine).toContain('/settings');
  });
  it('Optional section excludes infrastructure URLs (robots/sitemap)', () => {
    const sections = splitSections(llmsTxt);
    const optional = sections.find((s) => s.heading === 'Optional');
    expect(optional, 'missing Optional section').toBeDefined();
    for (const item of listItems(optional!)) {
      const parsed = parseLink(item);
      expect(parsed, `unparseable list item: ${item}`).not.toBeNull();
      expect(parsed?.url, `infrastructure url in Optional: ${parsed?.url}`).not.toMatch(
        /robots\.txt$|sitemap\.xml$/
      );
    }
  });
  it('advertises every public API handler that exists on disk', () => {
    const tarkovHandlers = getHandlers(TARKOV_API_DIR);
    const topLevelHandlers = getHandlers(TOP_LEVEL_API_DIR);
    const sections = splitSections(llmsTxt);
    const apiSection = sections.find((s) => s.heading === 'Public JSON APIs');
    expect(apiSection, 'missing Public JSON APIs section').toBeDefined();
    const advertised = new Set(
      listItems(apiSection!).map((l) => parseLink(l)?.url.split('/').at(-1))
    );
    for (const handler of tarkovHandlers) {
      expect(advertised.has(handler), `tarkov handler "${handler}" not advertised`).toBe(true);
    }
    for (const handler of topLevelHandlers) {
      expect(advertised.has(handler), `top-level handler "${handler}" not advertised`).toBe(true);
    }
  });
});
