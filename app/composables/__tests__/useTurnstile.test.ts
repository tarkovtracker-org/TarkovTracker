// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_SCRIPT_LOAD_ATTEMPTS,
  SCRIPT_LOAD_RETRY_MS,
  TOKEN_WAIT_TIMEOUT_MS,
  type TurnstileWidgetOptions,
  type UseTurnstileWidgetReturn,
} from '@/composables/useTurnstile';
const { useRuntimeConfigMock, loggerMock } = vi.hoisted(() => ({
  useRuntimeConfigMock: vi.fn(),
  loggerMock: { debug: vi.fn(), warn: vi.fn() },
}));
mockNuxtImport('useRuntimeConfig', () => useRuntimeConfigMock);
vi.mock('@/utils/logger', () => ({
  logger: loggerMock,
}));
type RenderOptions = {
  sitekey: string;
  action?: string;
  appearance: 'always' | 'execute' | 'interaction-only';
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
const mountHarness = async (options?: TurnstileWidgetOptions) => {
  const container = ref<HTMLElement | null>(document.createElement('div'));
  let result: UseTurnstileWidgetReturn | undefined;
  const { useTurnstileWidget } = await import('@/composables/useTurnstile');
  const wrapper = mount(
    defineComponent({
      setup() {
        result = useTurnstileWidget(container, options);
        return () => null;
      },
    })
  );
  await flushMicrotasks();
  return { container, result: result!, wrapper };
};
const captureScripts = (): HTMLScriptElement[] => {
  const scripts: HTMLScriptElement[] = [];
  vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
    if (node instanceof HTMLScriptElement) scripts.push(node);
    return node;
  });
  return scripts;
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
    expect(getOptions().appearance).toBe('always');
    expect(result.solved.value).toBe(false);
    const pendingToken = result.getToken();
    getOptions().callback('verified-token');
    await expect(pendingToken).resolves.toBe('verified-token');
    expect(result.solved.value).toBe(true);
    await expect(result.getToken()).resolves.toBe('verified-token');
    result.reset();
    expect(api.reset).toHaveBeenCalledWith('widget-1');
    expect(result.solved.value).toBe(false);
    wrapper.unmount();
    expect(api.remove).toHaveBeenCalledWith('widget-1');
    expect(result.solved.value).toBe(false);
  });
  it('clears solved state when the widget reports an error or the token expires', async () => {
    const { api, getOptions } = createApi();
    setTurnstileApi(api);
    const { result, wrapper } = await mountHarness();
    getOptions().callback('verified-token');
    expect(result.solved.value).toBe(true);
    getOptions()['expired-callback']();
    expect(result.solved.value).toBe(false);
    getOptions().callback('verified-token');
    expect(result.solved.value).toBe(true);
    getOptions()['error-callback']();
    expect(result.solved.value).toBe(false);
    wrapper.unmount();
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
  it('renders with an explicit site key and action', async () => {
    useRuntimeConfigMock.mockReturnValue({ public: { turnstileSiteKey: '' } });
    const { api, getOptions } = createApi();
    setTurnstileApi(api);
    const { result, wrapper } = await mountHarness({
      siteKey: ' gate-key ',
      action: 'tarkov_data_access',
    });
    expect(result.enabled).toBe(true);
    expect(getOptions()).toMatchObject({ sitekey: 'gate-key', action: 'tarkov_data_access' });
    expect(result.ready.value).toBe(true);
    expect(result.unavailable.value).toBe(false);
    wrapper.unmount();
  });
  it('omits the render action when none is configured', async () => {
    const { api, getOptions } = createApi();
    setTurnstileApi(api);
    const { wrapper } = await mountHarness();
    expect(getOptions()).toMatchObject({ sitekey: 'site-key' });
    expect(getOptions()).not.toHaveProperty('action');
    wrapper.unmount();
  });
  it('prefers a blank explicit site key over the public config', async () => {
    const { api } = createApi();
    setTurnstileApi(api);
    const { result, wrapper } = await mountHarness({ siteKey: '   ' });
    expect(result.enabled).toBe(false);
    expect(result.unavailable.value).toBe(true);
    expect(api.render).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('marks the widget unavailable when it reports an error', async () => {
    const { api, getOptions } = createApi();
    setTurnstileApi(api);
    const { result, wrapper } = await mountHarness();
    expect(result.unavailable.value).toBe(false);
    getOptions()['error-callback']();
    expect(result.unavailable.value).toBe(true);
    wrapper.unmount();
    expect(result.unavailable.value).toBe(false);
  });
  it('marks the widget unavailable when render yields no widget', async () => {
    const api: TurnstileApi = { render: vi.fn(() => undefined), remove: vi.fn(), reset: vi.fn() };
    setTurnstileApi(api);
    const { result, wrapper } = await mountHarness();
    expect(result.ready.value).toBe(false);
    expect(result.unavailable.value).toBe(true);
    await expect(result.getToken()).resolves.toBeNull();
    wrapper.unmount();
    expect(api.remove).not.toHaveBeenCalled();
  });
  it('clears a latched widget error on reset so a repeat error transitions again', async () => {
    let options: { 'error-callback'?: () => void } = {};
    const api: TurnstileApi = {
      render: vi.fn((_element, renderOptions) => {
        options = renderOptions as typeof options;
        return 'widget-1';
      }),
      remove: vi.fn(),
      reset: vi.fn(),
    };
    setTurnstileApi(api);
    const { result, wrapper } = await mountHarness();
    options['error-callback']?.();
    expect(result.unavailable.value).toBe(true);
    result.reset();
    expect(result.unavailable.value).toBe(false);
    expect(api.reset).toHaveBeenCalledWith('widget-1');
    vi.mocked(api.reset).mockImplementationOnce(() => {
      throw new Error('gone');
    });
    result.reset();
    expect(result.unavailable.value).toBe(true);
    (options as { callback?: (token: string) => void }).callback?.('recovered');
    expect(result.unavailable.value).toBe(false);
    await expect(result.getToken()).resolves.toBe('recovered');
    wrapper.unmount();
  });
  it('re-renders an unrendered widget on reset with a fresh unavailable state', async () => {
    const render = vi.fn<(element: HTMLElement, options: unknown) => string | undefined>(
      () => undefined
    );
    const api: TurnstileApi = { render, remove: vi.fn(), reset: vi.fn() };
    setTurnstileApi(api);
    const { result, wrapper } = await mountHarness();
    expect(result.unavailable.value).toBe(true);
    render.mockReturnValueOnce('widget-2');
    result.reset();
    await flushMicrotasks();
    expect(render).toHaveBeenCalledTimes(2);
    expect(result.unavailable.value).toBe(false);
    expect(result.ready.value).toBe(true);
    expect(api.reset).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('marks the widget unavailable when render throws', async () => {
    const renderError = new Error('invalid sitekey');
    const api: TurnstileApi = {
      render: vi.fn(() => {
        throw renderError;
      }),
      remove: vi.fn(),
      reset: vi.fn(),
    };
    setTurnstileApi(api);
    const { result, wrapper } = await mountHarness();
    expect(result.ready.value).toBe(false);
    expect(result.unavailable.value).toBe(true);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[Turnstile] Failed to render widget:',
      renderError
    );
    wrapper.unmount();
  });
  it('abandons a stalled script load and bounds the retries', async () => {
    vi.useFakeTimers();
    const scripts = captureScripts();
    const { result, wrapper } = await mountHarness();
    for (let step = 0; step < MAX_SCRIPT_LOAD_ATTEMPTS * 2; step += 1) {
      await vi.advanceTimersByTimeAsync(SCRIPT_LOAD_RETRY_MS);
      await flushMicrotasks();
    }
    expect(scripts).toHaveLength(MAX_SCRIPT_LOAD_ATTEMPTS);
    expect(result.ready.value).toBe(false);
    expect(result.unavailable.value).toBe(true);
    wrapper.unmount();
  });
  it('retries a script that loads without the API, then renders once it appears', async () => {
    vi.useFakeTimers();
    const scripts = captureScripts();
    const { api, getOptions } = createApi();
    const { result, wrapper } = await mountHarness({ action: 'tarkov_data_access' });
    scripts[0]!.onload?.(new Event('load'));
    await flushMicrotasks();
    expect(api.render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SCRIPT_LOAD_RETRY_MS);
    await flushMicrotasks();
    expect(scripts).toHaveLength(2);
    setTurnstileApi(api);
    scripts[1]!.onload?.(new Event('load'));
    await flushMicrotasks();
    expect(getOptions().action).toBe('tarkov_data_access');
    expect(result.ready.value).toBe(true);
    await vi.advanceTimersByTimeAsync(SCRIPT_LOAD_RETRY_MS * 2);
    await flushMicrotasks();
    expect(scripts).toHaveLength(2);
    expect(result.unavailable.value).toBe(false);
    wrapper.unmount();
  });
});
