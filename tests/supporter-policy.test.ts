// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const en = JSON.parse(read('app/locales/en.json'));
describe('supporter policy presentation', () => {
  it('leads with payment options and keeps the canonical policy on legal pages', () => {
    const page = read('app/pages/supporter.vue');
    expect(page).not.toContain('AccountRetentionPolicy');
    expect(page.indexOf('<SupporterOneTime')).toBeLessThan(
      page.indexOf('id="supporter-policies-title"')
    );
    for (const legalPage of ['terms-of-service', 'privacy']) {
      expect(read(`app/pages/${legalPage}.vue`)).toContain('<AccountRetentionPolicy />');
    }
  });
  it('links prominently to existing policies and exact payment and retention sections', () => {
    const page = read('app/pages/supporter.vue');
    const terms = read('app/pages/terms-of-service.vue');
    for (const anchor of ['supporter', 'refunds', 'privacy']) {
      expect(page).toContain(`to="/terms-of-service#${anchor}"`);
      expect(terms).toContain(`id="${anchor}"`);
    }
    expect(page).toContain('to="/privacy"');
    expect(page.indexOf('to="/terms-of-service#supporter"')).toBeLessThan(
      page.indexOf('id="tiers"')
    );
  });
  it('distinguishes retention benefits and preserves material payment qualifications', () => {
    expect(read('app/features/supporter/SupporterTierCard.vue')).toContain(
      'page.supporter.perk_subscription_retention'
    );
    expect(read('app/features/supporter/SupporterOneTime.vue')).toContain(
      'page.supporter.perk_one_time_retention'
    );
    expect(en.page.supporter.perk_subscription_retention).toContain('qualifying subscription');
    expect(en.page.supporter.perk_one_time_retention).toContain('qualifying support');
    expect(en.page.supporter.perk_one_time_retention).not.toContain('subscription');
    expect(en.page.supporter.billing_summary).toContain('renew automatically');
    expect(en.page.supporter.terms_summary).toContain('subject to applicable law');
    expect(en.page.supporter.retention_summary).toContain('not a guarantee of storage');
    expect(en.page.account_retention.exceptions).toContain(
      'Fully refunded contributions do not qualify'
    );
    expect(en.page.account_retention.exceptions).toContain(
      'chargeback immediately removes all supporter benefits'
    );
  });
});
