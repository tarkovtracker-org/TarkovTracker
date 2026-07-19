import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABEL_FALLBACKS,
  getGuidePrimaryAction,
  getGuideSecondaryLinks,
  getPrimaryAction,
  getSecondaryActions,
  matchesResourceSearch,
  RESOURCE_CATEGORIES,
  RESOURCES,
  splitSecondaryActions,
} from '@/features/resources/resourceData';
type LocaleNode = Record<string, unknown>;
const en = JSON.parse(readFileSync(join(process.cwd(), 'app/locales/en.json'), 'utf8')) as {
  page: {
    resources: {
      items: Record<string, { name?: string; description?: string }>;
      guides: Record<string, LocaleNode>;
      categories: Record<string, string>;
      category_badges: Record<string, string>;
      actions: Record<string, string>;
    };
  };
};
const resourcesLocale = en.page.resources;
const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const expectedGuideKeys = (
  steps: number,
  tips: number,
  faq: number,
  troubleshooting = 0,
  compatibility = false
): string[] => {
  const keys = ['overview'];
  if (compatibility) keys.push('compatibility');
  for (let n = 1; n <= steps; n++) {
    keys.push(`step_${n}_title`, `step_${n}_desc`);
  }
  for (let n = 1; n <= troubleshooting; n++) {
    keys.push(`troubleshooting_${n}_title`, `troubleshooting_${n}_desc`);
  }
  for (let n = 1; n <= tips; n++) {
    keys.push(`tip_${n}`);
  }
  for (let n = 1; n <= faq; n++) {
    keys.push(`faq_${n}_q`, `faq_${n}_a`);
  }
  return keys;
};
describe('resourceData locale parity', () => {
  it('defines at least one resource', () => {
    expect(RESOURCES.length).toBeGreaterThan(0);
  });
  it('does not include a self-referential TarkovTracker featured card', () => {
    expect(RESOURCES.some((resource) => resource.slug === 'tarkovtracker')).toBe(false);
  });
  it('covers every category with at least one resource', () => {
    for (const category of RESOURCE_CATEGORIES) {
      expect(
        RESOURCES.some((resource) => resource.category === category),
        `missing resources for ${category}`
      ).toBe(true);
      expect(nonEmptyString(resourcesLocale.categories[category])).toBe(true);
      expect(nonEmptyString(resourcesLocale.category_badges[category])).toBe(true);
      expect(CATEGORY_LABEL_FALLBACKS[category]).toBeTruthy();
    }
  });
  it.each(RESOURCES.map((resource) => [resource.slug, resource] as const))(
    'has non-empty item name and description for %s',
    (slug) => {
      const item = resourcesLocale.items[slug];
      expect(item, `missing page.resources.items.${slug}`).toBeDefined();
      expect(nonEmptyString(item?.name), `page.resources.items.${slug}.name`).toBe(true);
      expect(nonEmptyString(item?.description), `page.resources.items.${slug}.description`).toBe(
        true
      );
    }
  );
  it.each(RESOURCES.map((resource) => [resource.slug, resource] as const))(
    'defines a primary action and secondary links for %s',
    (_slug, resource) => {
      const primary = getPrimaryAction(resource);
      expect(primary).not.toBeNull();
      expect(resource.keywords.length).toBeGreaterThan(0);
      const secondary = getSecondaryActions(resource);
      if (primary?.external) {
        expect(secondary.every((action) => action.href !== primary.href)).toBe(true);
      }
    }
  );
  it.each(
    RESOURCES.filter((resource) => resource.hasGuide).map(
      (resource) => [resource.slug, resource] as const
    )
  )('has matching guide locale keys for %s', (slug, resource) => {
    const guideConfig = resource.guide;
    if (!guideConfig) {
      throw new Error(`${slug} hasGuide without guide config`);
    }
    const guideLocale = resourcesLocale.guides[slug];
    if (!guideLocale) {
      throw new Error(`missing page.resources.guides.${slug}`);
    }
    const requiredKeys = expectedGuideKeys(
      guideConfig.steps,
      guideConfig.tips,
      guideConfig.faq,
      guideConfig.troubleshooting ?? 0,
      Boolean(guideConfig.compatibility)
    );
    for (const key of requiredKeys) {
      expect(
        nonEmptyString(guideLocale[key]),
        `missing or empty page.resources.guides.${slug}.${key}`
      ).toBe(true);
    }
    const localeKeys = Object.keys(guideLocale);
    for (const key of localeKeys) {
      if (key === 'overview' || key === 'compatibility') continue;
      const stepMatch = key.match(/^step_(\d+)_(?:title|desc)$/);
      if (stepMatch) {
        expect(Number(stepMatch[1]), `orphan ${slug}.${key}`).toBeLessThanOrEqual(
          guideConfig.steps
        );
        continue;
      }
      const troubleshootingMatch = key.match(/^troubleshooting_(\d+)_(?:title|desc)$/);
      if (troubleshootingMatch) {
        expect(Number(troubleshootingMatch[1]), `orphan ${slug}.${key}`).toBeLessThanOrEqual(
          guideConfig.troubleshooting ?? 0
        );
        continue;
      }
      const tipMatch = key.match(/^tip_(\d+)$/);
      if (tipMatch) {
        expect(Number(tipMatch[1]), `orphan ${slug}.${key}`).toBeLessThanOrEqual(guideConfig.tips);
        continue;
      }
      const faqMatch = key.match(/^faq_(\d+)_[qa]$/);
      if (faqMatch) {
        expect(Number(faqMatch[1]), `orphan ${slug}.${key}`).toBeLessThanOrEqual(guideConfig.faq);
        continue;
      }
      expect.fail(`unrecognized guide locale key ${slug}.${key}`);
    }
  });
  it('does not declare guide configs for resources without hasGuide', () => {
    for (const resource of RESOURCES.filter((entry) => !entry.hasGuide)) {
      expect(resource.guide, `${resource.slug} should not define guide`).toBeUndefined();
      expect(resourcesLocale.guides[resource.slug]).toBeUndefined();
    }
  });
  it('matches search queries against name, purpose, and keywords', () => {
    const ratScanner = RESOURCES.find((resource) => resource.slug === 'ratscanner');
    if (!ratScanner) throw new Error('ratscanner missing');
    expect(
      matchesResourceSearch(ratScanner, 'scanner', 'RatScanner', 'Scan tooltips', 'Companion Apps')
    ).toBe(true);
    expect(
      matchesResourceSearch(ratScanner, 'API', 'RatScanner', 'Scan tooltips', 'Companion Apps')
    ).toBe(false);
  });
  it('keeps one secondary action visible and groups the rest as more', () => {
    const tarkovdev = RESOURCES.find((resource) => resource.slug === 'tarkovdev');
    if (!tarkovdev) throw new Error('tarkovdev missing');
    const split = splitSecondaryActions(tarkovdev);
    expect(split.highlighted).not.toBeNull();
    expect(split.more.length).toBeGreaterThan(0);
    expect(getSecondaryActions(tarkovdev).length).toBe(
      (split.highlighted ? 1 : 0) + split.more.length
    );
  });
  it('uses a download release action for companion app guides', () => {
    const ratScanner = RESOURCES.find((resource) => resource.slug === 'ratscanner');
    if (!ratScanner) throw new Error('ratscanner missing');
    const primary = getGuidePrimaryAction(ratScanner);
    expect(primary?.href).toBe('https://github.com/RatScanner/RatScanner/releases');
    expect(primary?.labelFallback).toBe('Download latest release');
  });
  it('labels the project website as a secondary link on API guides', () => {
    const tarkovdev = RESOURCES.find((resource) => resource.slug === 'tarkovdev');
    if (!tarkovdev) throw new Error('tarkovdev missing');
    const website = getGuideSecondaryLinks(tarkovdev).find(
      (action) => action.href === 'https://tarkov.dev/'
    );
    expect(website).toMatchObject({
      labelKey: 'page.resources.link_types.project_website',
      labelFallback: 'Project website',
    });
  });
});
