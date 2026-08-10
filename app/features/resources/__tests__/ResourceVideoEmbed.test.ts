import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import ResourceVideoEmbed from '@/features/resources/ResourceVideoEmbed.vue';
describe('ResourceVideoEmbed', () => {
  it('loads the privacy-enhanced player only after consent', async () => {
    const wrapper = await mountSuspended(ResourceVideoEmbed, {
      props: { videoId: 'HGwD4drUq0I', title: 'TarkovMonitor walkthrough' },
      global: {
        stubs: {
          NuxtImg: { props: ['src', 'alt'], template: '<img :src="src" :alt="alt" />' },
          UIcon: true,
        },
      },
    });
    expect(wrapper.find('img').attributes('src')).toBe(
      'https://i.ytimg.com/vi/HGwD4drUq0I/hqdefault.jpg'
    );
    expect(wrapper.find('iframe').exists()).toBe(false);
    await wrapper.get('button').trigger('click');
    expect(wrapper.get('iframe').attributes('src')).toBe(
      'https://www.youtube-nocookie.com/embed/HGwD4drUq0I?autoplay=1&rel=0'
    );
  });
});
