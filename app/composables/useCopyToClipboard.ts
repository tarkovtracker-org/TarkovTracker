import { logger } from '@/utils/logger';
export interface UseCopyToClipboardReturn {
  copyToClipboard: (text: string, options?: CopyToClipboardOptions) => Promise<boolean>;
}
export interface CopyToClipboardOptions {
  revealValue?: boolean;
  shouldNotify?: () => boolean;
}
async function writeToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    logger.warn('[Clipboard] Clipboard API failed, trying fallback:', error);
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  } catch (error) {
    logger.error('[Clipboard] Fallback copy failed:', error);
    return false;
  }
}
export function useCopyToClipboard(): UseCopyToClipboardReturn {
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const notifyClipboardResult = (success: boolean, text: string, revealValue: boolean) => {
    const message = success
      ? {
          color: 'success' as const,
          descriptionKey: 'toast.clipboard_copied.description',
          titleKey: 'toast.clipboard_copied.title',
        }
      : {
          color: 'error' as const,
          descriptionKey: 'toast.clipboard_error.description',
          titleKey: 'toast.clipboard_error.title',
        };
    toast.add({
      title: t(message.titleKey),
      description: revealValue ? t(message.descriptionKey, { value: text }) : undefined,
      color: message.color,
    });
  };
  const copyToClipboard = async (
    text: string,
    { revealValue = true, shouldNotify = () => true }: CopyToClipboardOptions = {}
  ): Promise<boolean> => {
    const success = await writeToClipboard(text);
    if (!shouldNotify()) return success;
    notifyClipboardResult(success, text, revealValue);
    return success;
  };
  return { copyToClipboard };
}
export { writeToClipboard };
