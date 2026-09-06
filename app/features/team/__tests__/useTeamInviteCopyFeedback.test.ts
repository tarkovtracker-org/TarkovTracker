// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
const mockCopyToClipboard = vi.fn();
vi.mock('@/composables/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard: mockCopyToClipboard }),
}));
describe('useTeamInviteCopyFeedback', () => {
  afterEach(() => {
    vi.useRealTimers();
    mockCopyToClipboard.mockReset();
  });
  it('shows successful feedback and resets it after the feedback duration', async () => {
    vi.useFakeTimers();
    mockCopyToClipboard.mockResolvedValue(true);
    const { useTeamInviteCopyFeedback } = await import('@/features/team/useTeamInviteCopyFeedback');
    let copiedText = '';
    let copyInviteLink!: (inviteUrl: string) => Promise<boolean>;
    const Harness = defineComponent({
      setup() {
        const feedback = useTeamInviteCopyFeedback();
        copyInviteLink = feedback.copyInviteLink;
        return () => {
          copiedText = feedback.copied.value ? 'copied' : 'idle';
          return h('span', copiedText);
        };
      },
    });
    const wrapper = mount(Harness);
    await expect(copyInviteLink('https://example.test/team?code=private')).resolves.toBe(true);
    await wrapper.vm.$nextTick();
    expect(copiedText).toBe('copied');
    await vi.advanceTimersByTimeAsync(2000);
    await wrapper.vm.$nextTick();
    expect(copiedText).toBe('idle');
    wrapper.unmount();
  });
  it('rejects an empty invite without writing to the clipboard', async () => {
    const { useTeamInviteCopyFeedback } = await import('@/features/team/useTeamInviteCopyFeedback');
    let copyInviteLink!: (inviteUrl: string) => Promise<boolean>;
    const Harness = defineComponent({
      setup() {
        ({ copyInviteLink } = useTeamInviteCopyFeedback());
        return () => h('span');
      },
    });
    const wrapper = mount(Harness);
    await expect(copyInviteLink('')).resolves.toBe(false);
    expect(mockCopyToClipboard).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('ignores stale success when a newer copy fails', async () => {
    let resolveFirstCopy!: (success: boolean) => void;
    mockCopyToClipboard
      .mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
          resolveFirstCopy = resolve;
        })
      )
      .mockResolvedValueOnce(false);
    const { useTeamInviteCopyFeedback } = await import('@/features/team/useTeamInviteCopyFeedback');
    let copiedText = '';
    let copyInviteLink!: (inviteUrl: string) => Promise<boolean>;
    const Harness = defineComponent({
      setup() {
        const feedback = useTeamInviteCopyFeedback();
        copyInviteLink = feedback.copyInviteLink;
        return () => {
          copiedText = feedback.copied.value ? 'copied' : 'idle';
          return h('span', copiedText);
        };
      },
    });
    const wrapper = mount(Harness);
    const firstCopy = copyInviteLink('https://example.test/team?code=first');
    await vi.waitFor(() => expect(mockCopyToClipboard).toHaveBeenCalledTimes(1));
    const secondCopy = copyInviteLink('https://example.test/team?code=second');
    expect(mockCopyToClipboard).toHaveBeenCalledTimes(1);
    resolveFirstCopy(true);
    expect(await firstCopy).toBe(false);
    expect(await secondCopy).toBe(false);
    expect(mockCopyToClipboard).toHaveBeenCalledTimes(2);
    await wrapper.vm.$nextTick();
    expect(copiedText).toBe('idle');
    wrapper.unmount();
  });
  it('returns false when the clipboard copy fails', async () => {
    mockCopyToClipboard.mockResolvedValue(false);
    const { useTeamInviteCopyFeedback } = await import('@/features/team/useTeamInviteCopyFeedback');
    let copyInviteLink!: (inviteUrl: string) => Promise<boolean>;
    const Harness = defineComponent({
      setup() {
        ({ copyInviteLink } = useTeamInviteCopyFeedback());
        return () => h('span');
      },
    });
    const wrapper = mount(Harness);
    await expect(copyInviteLink('https://example.test/team?code=private')).resolves.toBe(false);
    wrapper.unmount();
  });
  it('clears an existing feedback timer before starting another copy', async () => {
    vi.useFakeTimers();
    mockCopyToClipboard.mockResolvedValue(true);
    const { useTeamInviteCopyFeedback } = await import('@/features/team/useTeamInviteCopyFeedback');
    let copyInviteLink!: (inviteUrl: string) => Promise<boolean>;
    const Harness = defineComponent({
      setup() {
        const feedback = useTeamInviteCopyFeedback();
        copyInviteLink = feedback.copyInviteLink;
        return () => h('span', feedback.copied.value ? 'copied' : 'idle');
      },
    });
    const wrapper = mount(Harness);
    await copyInviteLink('https://example.test/team?code=first');
    await vi.advanceTimersByTimeAsync(1000);
    await copyInviteLink('https://example.test/team?code=second');
    expect(wrapper.text()).toBe('copied');
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.text()).toBe('copied');
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.text()).toBe('idle');
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
