// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
const accountPageSourcePath = join(process.cwd(), 'app/pages/account.vue');
describe('account page', () => {
  it('renders settings content in place instead of redirecting', () => {
    const source = readFileSync(accountPageSourcePath, 'utf8');
    expect(source).toContain('<SettingsPage />');
    expect(source).not.toContain('redirect:');
  });
  it('keeps account traffic behind auth middleware', () => {
    const source = readFileSync(accountPageSourcePath, 'utf8');
    expect(source).toContain("middleware: ['auth']");
  });
  it('keeps standalone account controls removed', () => {
    const source = readFileSync(accountPageSourcePath, 'utf8');
    expect(source).not.toContain('AccountDeletionCard');
    expect(source).not.toContain('ProfileSharingCard');
    expect(source).not.toContain('PrivacyCard');
    expect(source).not.toContain('settings.general.admin_panel');
  });
});
