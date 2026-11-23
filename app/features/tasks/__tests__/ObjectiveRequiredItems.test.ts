// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ObjectiveItemDisplay from '@/features/tasks/ObjectiveItemDisplay.vue';
import ObjectiveRequiredItems from '@/features/tasks/ObjectiveRequiredItems.vue';
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key, locale: 'en' }));
mockNuxtImport('useCopyToClipboard', () => () => ({ copyToClipboard: vi.fn() }));
vi.mock('@/composables/useWikiLink', () => ({
  useWikiLink: () => ({ toWikiUrl: (url: string) => url }),
}));
describe('ObjectiveRequiredItems', () => {
  it('preserves alternative key groups alongside individually required keys', () => {
    const a = { id: 'a', name: 'Key A' };
    const b = { id: 'b', name: 'Key B' };
    const c = { id: 'c', name: 'Key C' };
    const d = { id: 'd', name: 'Key D' };
    const wrapper = mount(ObjectiveRequiredItems, {
      props: { variant: 'keys', requiredKeys: [[a, b, a], [c], [a, d]] },
      global: {
        mocks: { $t: (key: string) => key },
        stubs: {
          AppTooltip: { template: '<span><slot /></span>' },
          ContextMenu: true,
          ObjectiveItemDisplay: true,
          UIcon: true,
        },
      },
    });
    expect(
      wrapper.findAllComponents(ObjectiveItemDisplay).map((group) => group.props('acceptedItems'))
    ).toEqual([
      [a, b],
      [a, d],
    ]);
    expect(
      wrapper
        .findAll('a')
        .map((link) => link.text())
        .filter(Boolean)
    ).toEqual(['Key C']);
    wrapper.unmount();
  });
});
