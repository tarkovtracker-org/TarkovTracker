// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ResourceGuideSection from '@/features/resources/ResourceGuideSection.vue';
describe('ResourceGuideSection', () => {
  it('renders its title, icon, and content in an open article section', () => {
    const wrapper = mount(ResourceGuideSection, {
      props: { title: 'Overview', icon: 'i-mdi-information-outline', id: 'overview' },
      slots: { default: '<p>Guide content</p>' },
      global: { stubs: { UIcon: true } },
    });
    expect(wrapper.get('section').attributes('id')).toBe('overview');
    expect(wrapper.get('h2').text()).toBe('Overview');
    expect(wrapper.getComponent({ name: 'UIcon' }).props('name')).toBe('i-mdi-information-outline');
    expect(wrapper.get('p').text()).toBe('Guide content');
  });
});
