import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { useRouter } from '#imports';
import { useRouteSeo } from '@/composables/useRouteSeo';
import { RESOURCES } from '@/features/resources/resourceData';
describe('route metadata navigation', () => {
  it('removes selected guide image metadata and restores public indexing after a private route', async () => {
    const resource = RESOURCES.find((entry) => entry.slug === 'tarkovmonitor');
    if (!resource?.hasGuide) throw new Error('Missing test guide');
    resource.guide.shareImage = {
      src: '/test-share.webp',
      width: 1200,
      height: 630,
      altKey: 'seo.routes.tarkovmonitor.title',
    };
    let router: ReturnType<typeof useRouter>;
    const wrapper = await mountSuspended(
      defineComponent({
        setup() {
          router = useRouter();
          useRouteSeo();
          return () => h('span');
        },
      }),
      { route: '/resources/tarkovmonitor' }
    );
    const settleHead = async () => {
      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 100));
    };
    try {
      await settleHead();
      expect(
        document.head.querySelector('meta[property="og:image"]')?.getAttribute('content')
      ).toBe('https://tarkovtracker.org/test-share.webp');
      await router!.push('/settings');
      await settleHead();
      expect(document.head.querySelector('meta[property="og:image"]')).toBeNull();
      expect(
        document.head.querySelector('meta[property="og:title"]')?.getAttribute('content')
      ).toBe('Settings');
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex, nofollow'
      );
      await router!.push('/tasks');
      await settleHead();
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'index, follow'
      );
      expect(
        document.head.querySelector('meta[name="twitter:card"]')?.getAttribute('content')
      ).toBe('summary');
      expect(
        document.head.querySelector('meta[property="og:title"]')?.getAttribute('content')
      ).toBe('Tarkov Quest Tracker');
      expect(
        document.head.querySelector('meta[name="twitter:title"]')?.getAttribute('content')
      ).toBe('Tarkov Quest Tracker');
      expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
      expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        'https://tarkovtracker.org/tasks'
      );
    } finally {
      delete resource.guide.shareImage;
      wrapper.unmount();
    }
  });
});
