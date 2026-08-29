// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
const mockCopyToClipboard = vi.fn();
vi.mock('@/composables/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard: mockCopyToClipboard }),
}));
describe('useTeamInviteCopyFeedback', () => {
  it('does not schedule feedback after the consumer unmounts', async () => {
    let resolveCopy!: (success: boolean) => void;
    mockCopyToClipboard.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveCopy = resolve;
      })
    );
    const { useTeamInviteCopyFeedback } = await import('@/features/team/useTeamInviteCopyFeedback');
    let copyPromise: Promise<boolean> | null = null;
    const Harness = defineComponent({
      setup() {
        const { copied, copyInviteLink } = useTeamInviteCopyFeedback();
        copyPromise = copyInviteLink('https://example.test/team?code=private');
        return () => h('span', copied.value ? 'copied' : 'idle');
      },
    });
    const wrapper = mount(Harness);
    wrapper.unmount();
    resolveCopy(true);
    expect(await copyPromise).toBe(false);
  });
});
