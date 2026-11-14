// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DebugStateCard from '@/features/settings/DebugStateCard.vue';
const { privateSnapshot, toast } = vi.hoisted(() => ({
  privateSnapshot: JSON.stringify({
    playerLevel: 42,
    tasks: [{ id: 'private-task', complete: true }],
  }),
  toast: { add: vi.fn() },
}));
mockNuxtImport('useToast', () => () => toast);
mockNuxtImport('useI18n', () => () => ({
  t: (key: string, params?: { value?: string }) => (params?.value ? `${key}:${params.value}` : key),
}));
vi.mock('@/composables/useDebugStateExport', () => ({
  useDebugStateExport: () => ({ exportDebugState: () => privateSnapshot }),
}));
describe('private debug export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });
  const mountCard = () =>
    mount(DebugStateCard, {
      global: {
        stubs: {
          GenericCard: { template: '<section><slot name="content" /></section>' },
          UButton: { template: '<button><slot /></button>' },
        },
      },
    });
  it.each([true, false])(
    'keeps the snapshot out of toast feedback when copying succeeds=%s',
    async (success) => {
      if (!success) vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'));
      const wrapper = mountCard();
      await wrapper.get('button').trigger('click');
      await vi.waitFor(() => expect(toast.add).toHaveBeenCalledTimes(1));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(privateSnapshot);
      expect(toast.add).toHaveBeenCalledWith(expect.objectContaining({ description: undefined }));
      expect(JSON.stringify(toast.add.mock.calls)).not.toContain('private-task');
      expect(wrapper.text()).not.toContain(privateSnapshot);
    }
  );
});
