// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { useStorylineRouteFocus } from '@/features/storyline/useStorylineRouteFocus';
const router = await vi.hoisted(async () => {
  const { reactive } = await import('vue');
  return {
    route: reactive({ path: '/storyline', hash: '', query: {} as Record<string, string> }),
    replace: vi.fn(),
  };
});
mockNuxtImport('useRoute', () => () => router.route);
mockNuxtImport('useRouter', () => () => ({ replace: router.replace }));
describe('useStorylineRouteFocus', () => {
  it('clears the highlight and dismissal listeners when chapter data resets', async () => {
    router.route.query = { chapter: 'tour', objective: 'talk' };
    const chapterCount = ref(1);
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();
    const removeListener = vi.spyOn(window, 'removeEventListener');
    onTestFinished(() => {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      removeListener.mockRestore();
      wrapper.unmount();
    });
    const wrapper = mount(
      defineComponent({
        setup: () => {
          useStorylineRouteFocus(chapterCount);
          return () =>
            h('label', { 'data-testid': 'row' }, [
              h('input', { id: 'storyline-objective-tour-talk' }),
            ]);
        },
      }),
      { attachTo: document.body }
    );
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalled());
    const row = wrapper.get('[data-testid="row"]');
    expect(row.classes()).toContain('ring-2');
    removeListener.mockClear();
    chapterCount.value = 0;
    await nextTick();
    expect(row.classes()).not.toContain('ring-2');
    expect(removeListener.mock.calls.map(([event]) => event)).toEqual(['pointerdown', 'keydown']);
  });
});
