// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
const mockCopyToClipboard = vi.fn();
vi.mock('@/composables/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard: mockCopyToClipboard }),
}));
describe('useTeamInviteCopyFeedback', () => {
  it('ignores stale success when a newer copy fails', async () => {
    let resolveFirstCopy!: (success: boolean) => void;
    let resolveSecondCopy!: (success: boolean) => void;
    mockCopyToClipboard
      .mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
          resolveFirstCopy = resolve;
        })
      )
      .mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
          resolveSecondCopy = resolve;
        })
      );
    const { useTeamInviteCopyFeedback } = await import('@/features/team/useTeamInviteCopyFeedback');
    let copiedText = '';
    let firstCopy: Promise<boolean> | null = null;
    let secondCopy: Promise<boolean> | null = null;
    const Harness = defineComponent({
      setup() {
        const { copied, copyInviteLink } = useTeamInviteCopyFeedback();
        firstCopy = copyInviteLink('https://example.test/team?code=first');
        secondCopy = copyInviteLink('https://example.test/team?code=second');
        return () => {
          copiedText = copied.value ? 'copied' : 'idle';
          return h('span', copiedText);
        };
      },
    });
    const wrapper = mount(Harness);
    resolveSecondCopy(false);
    expect(await secondCopy).toBe(false);
    resolveFirstCopy(true);
    expect(await firstCopy).toBe(false);
    await wrapper.vm.$nextTick();
    expect(copiedText).toBe('idle');
    wrapper.unmount();
  });
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
