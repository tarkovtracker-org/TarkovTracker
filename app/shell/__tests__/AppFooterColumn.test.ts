// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import AppFooterColumn from '@/shell/AppFooterColumn.vue';
const NuxtLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
};
describe('AppFooterColumn', () => {
  it('renders navigation links and actions with an accessible label', async () => {
    const onClick = vi.fn();
    const wrapper = mount(AppFooterColumn, {
      props: {
        title: 'Legal',
        items: [
          { label: 'Privacy', to: '/privacy' },
          { label: 'Analytics preferences', onClick },
        ],
      },
      global: { stubs: { NuxtLink: NuxtLinkStub } },
    });
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Legal');
    expect(wrapper.get('ul').classes()).toContain('list-disc');
    expect(wrapper.get('a').attributes('href')).toBe('/privacy');
    await wrapper.get('button').trigger('click');
    expect(onClick).toHaveBeenCalledOnce();
  });
});
