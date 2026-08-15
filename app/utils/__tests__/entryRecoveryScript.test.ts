// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTRY_RECOVERY_SCRIPT } from '@/utils/entryRecoveryScript';
const RETRY_KEY = 'tt:auto-reload-on-asset-error';
const registeredHandlers: Array<(event: Event) => void> = [];
function executeRecoveryScript(): void {
  const addEventListener = window.addEventListener.bind(window);
  const spy = vi.spyOn(window, 'addEventListener').mockImplementation(((
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) => {
    if (type === 'error' && options === true && typeof handler === 'function') {
      registeredHandlers.push(handler as (event: Event) => void);
    }
    addEventListener(type, handler, options);
  }) as typeof window.addEventListener);
  // happy-dom does not evaluate <script> elements, so run the built string directly.
  new Function(ENTRY_RECOVERY_SCRIPT)();
  spy.mockRestore();
}
function createFailingScript(attrs: Record<string, string>): HTMLScriptElement {
  const script = document.createElement('script');
  for (const [name, value] of Object.entries(attrs)) {
    script.setAttribute(name, value);
  }
  document.body.appendChild(script);
  return script;
}
function stubLocation(): ReturnType<typeof vi.fn> {
  const replace = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      href: 'https://app.test/tasks',
      origin: 'https://app.test',
      replace,
    },
    writable: true,
  });
  return replace;
}
describe('entryRecoveryScript', () => {
  let originalLocation: PropertyDescriptor | undefined;
  beforeEach(() => {
    originalLocation = Object.getOwnPropertyDescriptor(window, 'location');
    window.sessionStorage.clear();
    delete (window as unknown as { __ttEntryRecovery?: boolean }).__ttEntryRecovery;
  });
  afterEach(() => {
    for (const handler of registeredHandlers.splice(0)) {
      window.removeEventListener('error', handler, true);
    }
    if (originalLocation) {
      Object.defineProperty(window, 'location', originalLocation);
    }
  });
  it('reloads with a retry marker when a same-origin module script fails to load', () => {
    const replace = stubLocation();
    executeRecoveryScript();
    const failingScript = createFailingScript({ type: 'module', src: '/_nuxt/stale.js' });
    failingScript.dispatchEvent(new Event('error'));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('_tt_retry='));
    expect(replace.mock.calls[0]?.[0]).toMatch(/^https:\/\/app\.test\/tasks\?_tt_retry=\d+$/);
  });
  it('does not reload twice within one page load', () => {
    const replace = stubLocation();
    executeRecoveryScript();
    const first = createFailingScript({ type: 'module', src: '/_nuxt/a.js' });
    first.dispatchEvent(new Event('error'));
    const second = createFailingScript({ type: 'module', src: '/_nuxt/b.js' });
    second.dispatchEvent(new Event('error'));
    expect(replace).toHaveBeenCalledTimes(1);
  });
  it('ignores classic (non-module) script failures', () => {
    const replace = stubLocation();
    executeRecoveryScript();
    const failingScript = createFailingScript({ src: '/_nuxt/classic.js' });
    failingScript.dispatchEvent(new Event('error'));
    expect(replace).not.toHaveBeenCalled();
  });
  it('ignores cross-origin script failures', () => {
    const replace = stubLocation();
    executeRecoveryScript();
    const failingScript = createFailingScript({
      type: 'module',
      src: 'https://cdn.example.com/widget.js',
    });
    failingScript.dispatchEvent(new Event('error'));
    expect(replace).not.toHaveBeenCalled();
  });
  it('skips recovery during the shared reload cooldown', () => {
    window.sessionStorage.setItem(RETRY_KEY, String(Date.now() - 1000));
    const replace = stubLocation();
    executeRecoveryScript();
    const failingScript = createFailingScript({ type: 'module', src: '/_nuxt/stale.js' });
    failingScript.dispatchEvent(new Event('error'));
    expect(replace).not.toHaveBeenCalled();
  });
  it('bails without reloading when sessionStorage is unavailable', () => {
    vi.spyOn(window.sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const replace = stubLocation();
    executeRecoveryScript();
    const failingScript = createFailingScript({ type: 'module', src: '/_nuxt/stale.js' });
    failingScript.dispatchEvent(new Event('error'));
    expect(replace).not.toHaveBeenCalled();
  });
});
