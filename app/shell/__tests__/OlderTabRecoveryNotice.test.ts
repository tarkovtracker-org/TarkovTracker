import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OlderTabRecoveryNotice from '@/shell/OlderTabRecoveryNotice.vue';
import {
  legacyProgressRecoveryCount,
  legacyProgressRecoveryOverflow,
} from '@/stores/tarkov/progressAuthority';
const route = vi.hoisted(() => ({ name: 'index', path: '/', hash: '' }));
mockNuxtImport('useRoute', () => () => route);
const NOTICE = '[data-testid="older-tab-recovery-notice"]';
const mountNotice = () => mountSuspended(OlderTabRecoveryNotice);
describe('OlderTabRecoveryNotice', () => {
  beforeEach(() => {
    clearNuxtState('older-tab-recovery-notice');
    legacyProgressRecoveryCount.value = 0;
    legacyProgressRecoveryOverflow.value = false;
    route.name = 'index';
    route.path = '/';
    route.hash = '';
  });
  it('stays hidden without retained copies or overflow, inside a persistent live region', async () => {
    const wrapper = await mountNotice();
    expect(wrapper.find(NOTICE).exists()).toBe(false);
    expect(wrapper.get('[data-testid="older-tab-recovery-notice-region"]').attributes('role')).toBe(
      'status'
    );
  });
  it('shows when older-tab copies were retained', async () => {
    legacyProgressRecoveryCount.value = 2;
    const wrapper = await mountNotice();
    const notice = wrapper.get(NOTICE);
    expect(notice.text()).toContain('Edits from older tabs were kept');
    expect(notice.text()).toContain('They have not replaced your progress.');
  });
  it('shows the overflow warning when some copies could not be retained', async () => {
    legacyProgressRecoveryOverflow.value = true;
    const wrapper = await mountNotice();
    expect(wrapper.get(NOTICE).text()).toContain('could not be kept');
  });
  it('appears when copies are retained after mount', async () => {
    const wrapper = await mountNotice();
    legacyProgressRecoveryCount.value = 1;
    await wrapper.vm.$nextTick();
    expect(wrapper.find(NOTICE).exists()).toBe(true);
  });
  it('links to the Settings Backup & Restore section', async () => {
    legacyProgressRecoveryCount.value = 1;
    const wrapper = await mountNotice();
    const link = wrapper.get('[data-testid="older-tab-recovery-link"]');
    expect(link.attributes('href')).toBe('/settings#backup-restore');
    expect(link.text()).toBe('Review in Backup & Restore');
  });
  it('hides on the Backup & Restore tab that already lists the copies', async () => {
    legacyProgressRecoveryCount.value = 1;
    route.name = 'settings';
    route.path = '/settings';
    route.hash = '#backup-restore';
    const wrapper = await mountNotice();
    expect(wrapper.find(NOTICE).exists()).toBe(false);
  });
  it.each(['/progression', '/prestige', '/preferences'])(
    'hides on the Backup & Restore tab reached through the %s Settings alias',
    async (path) => {
      legacyProgressRecoveryCount.value = 1;
      route.name = 'settings';
      route.path = path;
      route.hash = '#backup-restore';
      const wrapper = await mountNotice();
      expect(wrapper.find(NOTICE).exists()).toBe(false);
    }
  );
  it('dismisses for the session and returns when more copies are retained', async () => {
    legacyProgressRecoveryCount.value = 1;
    const wrapper = await mountNotice();
    const dismiss = wrapper.get('[data-testid="older-tab-recovery-dismiss"]');
    expect(dismiss.attributes('aria-label')).toBe('Close');
    await dismiss.trigger('click');
    expect(wrapper.find(NOTICE).exists()).toBe(false);
    const remounted = await mountNotice();
    expect(remounted.find(NOTICE).exists()).toBe(false);
    legacyProgressRecoveryCount.value = 2;
    await remounted.vm.$nextTick();
    expect(remounted.find(NOTICE).exists()).toBe(true);
  });
  it('returns after dismissal when retention overflows', async () => {
    legacyProgressRecoveryCount.value = 1;
    const wrapper = await mountNotice();
    await wrapper.get('[data-testid="older-tab-recovery-dismiss"]').trigger('click');
    legacyProgressRecoveryOverflow.value = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.find(NOTICE).exists()).toBe(true);
  });
  it('announces new copies again after earlier copies were cleared', async () => {
    legacyProgressRecoveryCount.value = 2;
    const wrapper = await mountNotice();
    await wrapper.get('[data-testid="older-tab-recovery-dismiss"]').trigger('click');
    legacyProgressRecoveryCount.value = 0;
    await wrapper.vm.$nextTick();
    legacyProgressRecoveryCount.value = 1;
    await wrapper.vm.$nextTick();
    expect(wrapper.find(NOTICE).exists()).toBe(true);
  });
  it('announces a new copy after a partial export-and-clear lowered the count', async () => {
    legacyProgressRecoveryCount.value = 2;
    const wrapper = await mountNotice();
    await wrapper.get('[data-testid="older-tab-recovery-dismiss"]').trigger('click');
    // Export-and-clear removed the exported copies but kept one captured afterwards.
    legacyProgressRecoveryCount.value = 1;
    await wrapper.vm.$nextTick();
    expect(wrapper.find(NOTICE).exists()).toBe(false);
    legacyProgressRecoveryCount.value = 2;
    await wrapper.vm.$nextTick();
    expect(wrapper.find(NOTICE).exists()).toBe(true);
  });
  it('announces a new overflow after an earlier overflow was resolved', async () => {
    legacyProgressRecoveryCount.value = 1;
    legacyProgressRecoveryOverflow.value = true;
    const wrapper = await mountNotice();
    await wrapper.get('[data-testid="older-tab-recovery-dismiss"]').trigger('click');
    legacyProgressRecoveryOverflow.value = false;
    await wrapper.vm.$nextTick();
    legacyProgressRecoveryOverflow.value = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.find(NOTICE).exists()).toBe(true);
  });
});
