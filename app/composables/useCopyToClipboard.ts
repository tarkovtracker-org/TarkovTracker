import { logger } from '@/utils/logger';
export interface UseCopyToClipboardReturn {
  /**
   * Pass a promise for text that is still being built: the browser receives the clipboard write
   * inside the click, which Safari requires, and fills it when the text is ready.
   */
  copyToClipboard: (
    text: string | Promise<string>,
    options?: CopyToClipboardOptions
  ) => Promise<boolean>;
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
  let textarea: HTMLTextAreaElement | undefined;
  try {
    textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.setAttribute('data-clarity-mask', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    return document.execCommand('copy');
  } catch (error) {
    logger.error('[Clipboard] Fallback copy failed:', error);
    return false;
  } finally {
    textarea?.remove();
  }
}
const supportsDeferredClipboard = (): boolean =>
  typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function';
/** Rejects with the text promise's error, so a failed build is reported by the caller. */
async function writeDeferredToClipboard(text: Promise<string>): Promise<boolean> {
  if (supportsDeferredClipboard()) {
    try {
      const blob = text.then((value) => new Blob([value], { type: 'text/plain' }));
      // The caller observes a failed build through 	ext; this branch must not report it twice.
      blob.catch(() => undefined);
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      return true;
    } catch (error) {
      logger.warn('[Clipboard] Deferred clipboard write failed:', error);
    }
  }
  return writeToClipboard(await text);
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
    text: string | Promise<string>,
    { revealValue = true, shouldNotify = () => true }: CopyToClipboardOptions = {}
  ): Promise<boolean> => {
    const success = await (typeof text === 'string'
      ? writeToClipboard(text)
      : writeDeferredToClipboard(text));
    if (!shouldNotify()) return success;
    notifyClipboardResult(success, await text, revealValue);
    return success;
  };
  return { copyToClipboard };
}
export { writeToClipboard };
