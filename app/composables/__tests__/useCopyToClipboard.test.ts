// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mockToast = { add: vi.fn() };
mockNuxtImport('useToast', () => () => mockToast);
mockNuxtImport('useI18n', () => () => ({
  t: (key: string, params?: { value?: string }) => (params?.value ? `${key}:${params.value}` : key),
}));
const originalExecCommandDescriptor =
  typeof document !== 'undefined'
    ? Object.getOwnPropertyDescriptor(document, 'execCommand')
    : undefined;
const originalCreateElementDescriptor =
  typeof document !== 'undefined'
    ? Object.getOwnPropertyDescriptor(document, 'createElement')
    : undefined;
const restoreDocumentProperty = (
  property: 'execCommand' | 'createElement',
  descriptor?: PropertyDescriptor
) => {
  if (descriptor) {
    Object.defineProperty(document, property, descriptor);
  } else {
    Reflect.deleteProperty(document, property);
  }
};
describe('useCopyToClipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });
  afterEach(() => {
    restoreDocumentProperty('execCommand', originalExecCommandDescriptor);
    restoreDocumentProperty('createElement', originalCreateElementDescriptor);
  });
  it('copies text and can hide sensitive values from success feedback', async () => {
    const { useCopyToClipboard } = await import('@/composables/useCopyToClipboard');
    const { copyToClipboard } = useCopyToClipboard();
    await expect(copyToClipboard('private invite', { revealValue: false })).resolves.toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('private invite');
    expect(mockToast.add).toHaveBeenCalledWith({
      color: 'success',
      description: undefined,
      title: 'toast.clipboard_copied.title',
    });
  });
  describe('deferred text', () => {
    afterEach(() => vi.unstubAllGlobals());
    it('starts one clipboard write immediately and fills it when the text is ready', async () => {
      const write = vi.fn(async (items: Array<{ getType: (type: string) => Promise<Blob> }>) => {
        await items[0]!.getType('text/plain');
      });
      class TestClipboardItem {
        constructor(private readonly data: Record<string, Promise<Blob>>) {}
        getType(type: string) {
          return this.data[type]!;
        }
      }
      vi.stubGlobal('ClipboardItem', TestClipboardItem);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { write, writeText: vi.fn() },
      });
      let resolveText!: (value: string) => void;
      const text = new Promise<string>((resolve) => (resolveText = resolve));
      const { useCopyToClipboard } = await import('@/composables/useCopyToClipboard');
      const copied = useCopyToClipboard().copyToClipboard(text, { revealValue: false });
      expect(write).toHaveBeenCalledOnce();
      resolveText('late report');
      await expect(copied).resolves.toBe(true);
      const item = write.mock.calls[0]![0][0]!;
      await expect((await item.getType('text/plain')).text()).resolves.toBe('late report');
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
      expect(mockToast.add).toHaveBeenCalledWith({
        color: 'success',
        description: undefined,
        title: 'toast.clipboard_copied.title',
      });
    });
    it('falls back to a text write when deferred writes are unsupported', async () => {
      vi.stubGlobal('ClipboardItem', undefined);
      const { useCopyToClipboard } = await import('@/composables/useCopyToClipboard');
      await expect(
        useCopyToClipboard().copyToClipboard(Promise.resolve('report'), { revealValue: false })
      ).resolves.toBe(true);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('report');
    });
    it('rejects without feedback when the text cannot be built', async () => {
      vi.stubGlobal('ClipboardItem', undefined);
      const { useCopyToClipboard } = await import('@/composables/useCopyToClipboard');
      await expect(
        useCopyToClipboard().copyToClipboard(Promise.reject(new Error('build failed')))
      ).rejects.toThrow('build failed');
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
      expect(mockToast.add).not.toHaveBeenCalled();
    });
  });
  it('can suppress feedback for superseded copy operations', async () => {
    const { useCopyToClipboard } = await import('@/composables/useCopyToClipboard');
    const { copyToClipboard } = useCopyToClipboard();
    await expect(copyToClipboard('superseded invite', { shouldNotify: () => false })).resolves.toBe(
      true
    );
    expect(mockToast.add).not.toHaveBeenCalled();
  });
  it('falls back to execCommand when the Clipboard API rejects', async () => {
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'));
    const { writeToClipboard } = await import('@/composables/useCopyToClipboard');
    await expect(writeToClipboard('fallback text')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });
  it('shows value-aware error feedback when every copy method fails', async () => {
    Object.defineProperty(document, 'createElement', {
      configurable: true,
      value: vi.fn(() => {
        throw new Error('unavailable');
      }),
    });
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'));
    const { useCopyToClipboard } = await import('@/composables/useCopyToClipboard');
    const { copyToClipboard } = useCopyToClipboard();
    await expect(copyToClipboard('visible value')).resolves.toBe(false);
    expect(mockToast.add).toHaveBeenCalledWith({
      color: 'error',
      description: 'toast.clipboard_error.description:visible value',
      title: 'toast.clipboard_error.title',
    });
  });
  it.each(['false', 'throw'])(
    'masks and removes the fallback textarea when execCommand returns %s',
    async (outcome) => {
      vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'));
      let observedMask: string | null | undefined;
      let observedValue: string | undefined;
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: vi.fn(() => {
          const textarea = document.querySelector('textarea');
          observedMask = textarea?.getAttribute('data-clarity-mask');
          observedValue = textarea?.value;
          if (outcome === 'throw') throw new Error('copy failed');
          return false;
        }),
      });
      const { writeToClipboard } = await import('@/composables/useCopyToClipboard');
      await expect(writeToClipboard('private snapshot')).resolves.toBe(false);
      expect(observedMask).toBe('true');
      expect(observedValue).toBe('private snapshot');
      expect(document.querySelector('textarea')).toBeNull();
    }
  );
});
