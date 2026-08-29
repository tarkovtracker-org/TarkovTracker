import { useCopyToClipboard } from '@/composables/useCopyToClipboard';
const COPY_FEEDBACK_DURATION_MS = 2000;
export const useTeamInviteCopyFeedback = () => {
  const { copyToClipboard } = useCopyToClipboard();
  const copied = ref(false);
  let latestRequestId = 0;
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  const clearResetTimer = () => {
    if (!resetTimer) return;
    clearTimeout(resetTimer);
    resetTimer = null;
  };
  const copyInviteLink = async (inviteUrl: string): Promise<boolean> => {
    const requestId = ++latestRequestId;
    clearResetTimer();
    copied.value = false;
    if (!inviteUrl) return false;
    const success = await copyToClipboard(inviteUrl, { revealValue: false });
    if (requestId !== latestRequestId || !success) return false;
    copied.value = true;
    resetTimer = setTimeout(() => {
      copied.value = false;
      resetTimer = null;
    }, COPY_FEEDBACK_DURATION_MS);
    return true;
  };
  onUnmounted(() => {
    latestRequestId += 1;
    clearResetTimer();
  });
  return { copied, copyInviteLink };
};
