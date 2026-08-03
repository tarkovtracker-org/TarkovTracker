// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_SCRIPT_LOAD_ATTEMPTS,
  SCRIPT_LOAD_RETRY_MS,
  TOKEN_WAIT_TIMEOUT_MS,
  type UseTurnstileWidgetReturn,
} from '@/composables/useTurnstile';
const { useRuntimeConfigMock } = vi.hoisted(() => ({
  useRuntimeConfigMock: vi.fn(),
}));
mockNuxtImport('useRuntimeConfig', () => useRuntimeConfigMock);
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));
type RenderOptions = {
  callback: (token: string) => void;
  'error-callback': () => void;
  'expired-callback': () => void;
};
type TurnstileApi = {
  render: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
};
const flushMicrotasks = async (cycles = 6): Promise<void> => {
  for (let index = 0; index < cycles; index += 1) {
    await nextTick();
    await Promise.resolve();
  }
};
const createApi = () => {
  let options: RenderOptions | null = null;
  const api: TurnstileApi = {
    render: vi.fn((_element: HTMLElement, renderOptions: RenderOptions) => {
      options = renderOptions;
      return 'widget-1';
    }),
    remove: vi.fn(),
    reset: vi.fn(),
  };
  return {
    api,
    getOptions: () => {
      if (!options) throw new Error('Turnstile widget was not rendered');
      return options;
    },
  };
};
const setTurnstileApi = (api?: TurnstileApi): void => {
  const target = window as typeof window & { turnstile?: TurnstileApi };
  if (api) {
    target.turnstile = api;
  } else {
    delete target.turnstile;
  }
};
const mountHarness = async () => {
  const container = ref<HTMLElement | null>(document.createElement('div'));
  let result: UseTurnstileWidgetReturn | undefined;
  const { useTurnstileWidget } = await import('@/composables/useTurnstile');
  const wrapper = mount(
    defineComponent({
      setup() {
        result = useTurnstileWidget(container);
        return () => null;
      },
    })
  );
  await flushMicrotasks();
  return { container, result: result!, wrapper };
};
describe('useTurnstileWidget', () => {
  beforeEach(() => {
    vi.resetModules();
    useRuntimeConfigMock.mockReset();
    useRuntimeConfigMock.mockReturnValue({ public: { turnstileSiteKey: 'site-key' } });
    setTurnstileApi();
    document.head
      .querySelectorAll('script[src*="challenges.cloudflare.com/turnstile"]')
      .forEach((script) => script.remove());
  });
  afterEach(() => {
    vi.useRealTimers();
    setTurnstileApi();
  });
  it('stays ready without loading a widget when Turnstile is disabled', async () => {
    useRuntimeConfigMock.mockReturnValue({ public: { turnstileSiteKey: '' } });
    const { result, wrapper } = await mountHarness();
    expect(result.enabled).toBe(false);
    expect(result.ready.value).toBe(true);
    await expect(result.getToken()).resolves.toBeNull();
    wrapper.unmount();
  });
  it('delivers tokens and resets the rendered widget', async () => {
    const { api, getOptions } = createApi();
    setTurnstileApi(api);
    const { result, wrapper } = await mountHarness();
    expect(result.ready.value).toBe(true);
    const pendingToken = result.getToken();
    getOptions().callback('verified-token');
    await expect(pendingToken).resolves.toBe('verified-token');
    await expect(result.getToken()).resolves.toBe('verified-token');
    result.reset();
    expect(api.reset).toHaveBeenCalledWith('widget-1');
    wrapper.unmount();
    expect(api.remove).toHaveBeenCalledWith('widget-1');
  });
  it('resolves token waiters when the widget reports an error', async () => {
    const { api, getOptions } = createApi();
    setTurnstileApi(api);
    const { result, wrapper } = await mountHarness();
    const pendingToken = result.getToken();
    getOptions()['error-callback']();
    await expect(pendingToken).resolves.toBeNull();
    wrapper.unmount();
  });
  it('clears expired tokens before the next request', async () => {
    const { api, getOptions } = createApi();
    setTurnstileApi(api);
    const { result, wrapper } = await mountHarness();
    getOptions().callback('expired-token');
    getOptions()['expired-callback']();
    const pendingToken = result.getToken();
    getOptions()['error-callback']();
    await expect(pendingToken).resolves.toBeNull();
    wrapper.unmount();
  });
  it('times out token requests and removes the waiter', async () => {
    vi.useFakeTimers();
    const { api, getOptions } = createApi();
    setTurnstileApi(api);
    const { result, wrapper } = await mountHarness();
    const pendingToken = result.getToken();
    await vi.advanceTimersByTimeAsync(TOKEN_WAIT_TIMEOUT_MS);
    await expect(pendingToken).resolves.toBeNull();
    getOptions().callback('late-token');
    await expect(result.getToken()).resolves.toBe('late-token');
    wrapper.unmount();
  });
  it('keeps widget instances independent', async () => {
    const options: RenderOptions[] = [];
    const api: TurnstileApi = {
      render: vi.fn((_element: HTMLElement, renderOptions: RenderOptions) => {
        options.push(renderOptions);
        return `widget-${options.length}`;
      }),
      remove: vi.fn(),
      reset: vi.fn(),
    };
    setTurnstileApi(api);
    const first = await mountHarness();
    const second = await mountHarness();
    const firstToken = first.result.getToken();
    const secondToken = second.result.getToken();
    options[0]!.callback('first-token');
    options[1]!.callback('second-token');
    await expect(firstToken).resolves.toBe('first-token');
    await expect(secondToken).resolves.toBe('second-token');
    first.wrapper.unmount();
    second.wrapper.unmount();
    expect(api.remove).toHaveBeenCalledWith('widget-1');
    expect(api.remove).toHaveBeenCalledWith('widget-2');
  });
  it('bounds failed script loads and retries after the container changes', async () => {
    vi.useFakeTimers();
    let currentScript: HTMLScriptElement | null = null;
    const appendSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLScriptElement) currentScript = node;
      return node;
    });
    const { container, result, wrapper } = await mountHarness();
    const failCurrentScript = async (): Promise<void> => {
      if (!currentScript) throw new Error('Turnstile script was not appended');
      currentScript.onerror?.(new Event('error'));
      await flushMicrotasks();
    };
    await failCurrentScript();
    await vi.advanceTimersByTimeAsync(SCRIPT_LOAD_RETRY_MS);
    await flushMicrotasks();
    await failCurrentScript();
    await vi.advanceTimersByTimeAsync(SCRIPT_LOAD_RETRY_MS);
    await flushMicrotasks();
    await failCurrentScript();
    await vi.advanceTimersByTimeAsync(SCRIPT_LOAD_RETRY_MS * 2);
    await flushMicrotasks();
    const scriptAppendCount = () =>
      appendSpy.mock.calls.filter(([node]) => node instanceof HTMLScriptElement).length;
    expect(scriptAppendCount()).toBe(MAX_SCRIPT_LOAD_ATTEMPTS);
    expect(result.ready.value).toBe(false);
    container.value = null;
    await flushMicrotasks();
    container.value = document.createElement('div');
    await flushMicrotasks();
    expect(scriptAppendCount()).toBe(4);
    wrapper.unmount();
  });
});
