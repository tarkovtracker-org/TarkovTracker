// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { nextTick, ref, type Ref } from 'vue';
import TarkovAccessGate from '@/components/TarkovAccessGate.vue';
import { logger } from '@/utils/logger';
import {
  ensureTarkovAccess,
  getTarkovAccessState,
  reportGateWidgetUnavailable,
  requestGateRetry,
  resetTarkovAccessForTests,
  tarkovApiFetch,
  TARKOV_ACCESS_WIDGET_ACTION,
} from '@/utils/tarkovApiFetch';
const { config, fetchAllData, useTurnstileWidgetMock } = vi.hoisted(() => ({
  config: vi.fn(),
  fetchAllData: vi.fn(),
  useTurnstileWidgetMock: vi.fn(),
}));
vi.mock('@/stores/useMetadata', () => ({ useMetadataStore: () => ({ fetchAllData }) }));
mockNuxtImport('useRuntimeConfig', () => config);
mockNuxtImport('useI18n', () => () => ({
  t: (key: string) => key,
}));
vi.mock('@/composables/useTurnstile', () => ({ useTurnstileWidget: useTurnstileWidgetMock }));
vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), debug: vi.fn() } }));
type WidgetMock = {
  enabled: boolean;
  ready: Ref<boolean>;
  solved: Ref<boolean>;
  unavailable: Ref<boolean>;
  getToken: Mock<() => Promise<string | null>>;
  reset: Mock<() => void>;
};
type Outcome = { state: 'pending' | 'fulfilled' | 'rejected'; value?: unknown };
const UModalStub = {
  props: ['open', 'title', 'description', 'dismissible', 'close'],
  template:
    '<section v-if="open" data-testid="modal"><h2>{{ title }}</h2><slot name="body" /></section>',
};
const UButtonStub = {
  inheritAttrs: false,
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
};
const VERIFY_ENDPOINT = '/api/security/tarkov-verify';
const json = (body: unknown = { ok: true }, status = 200) =>
  new Response(JSON.stringify(body), { status });
const challenge = () =>
  new Response('NOT JSON', {
    status: 403,
    headers: { 'cf-mitigated': 'challenge' },
  });
const settle = async () => {
  for (let i = 0; i < 3; i++) await flushPromises();
  await nextTick();
};
const track = (promise: Promise<unknown>): Outcome => {
  const outcome: Outcome = { state: 'pending' };
  promise.then(
    (value) => Object.assign(outcome, { state: 'fulfilled', value }),
    (value) => Object.assign(outcome, { state: 'rejected', value })
  );
  return outcome;
};
const createWidget = (): WidgetMock => {
  const solved = ref(false);
  return {
    enabled: true,
    ready: ref(true),
    solved,
    unavailable: ref(false),
    getToken: vi.fn<() => Promise<string | null>>(async () => 'widget-token'),
    reset: vi.fn(() => {
      solved.value = false;
    }),
  };
};
const verifyBodies = (network: Mock) =>
  network.mock.calls
    .filter(([url]) => String(url).endsWith(VERIFY_ENDPOINT))
    .map(([, init]) => (init as RequestInit).body);
const modal = (wrapper: VueWrapper) => wrapper.findComponent(UModalStub);
const isVisible = (wrapper: VueWrapper) =>
  wrapper.find('[data-testid="tarkov-access-gate"]').exists();
const hasWidget = (wrapper: VueWrapper) =>
  wrapper.find('[data-testid="tarkov-access-gate-widget"]').exists();
const retryButton = (wrapper: VueWrapper) =>
  wrapper.find('[data-testid="tarkov-access-gate-retry"]');
const dismissButton = (wrapper: VueWrapper) =>
  wrapper.find('[data-testid="tarkov-access-gate-dismiss"]');
const statusText = (wrapper: VueWrapper) => wrapper.find('[role="status"]').text();
let network: Mock;
let widget: WidgetMock;
const mountGate = async () => {
  const wrapper = mount(TarkovAccessGate, {
    global: { stubs: { UModal: UModalStub, UButton: UButtonStub } },
  });
  await settle();
  return wrapper;
};
const startChallengedRequest = async (): Promise<{ outcome: Outcome }> => {
  network.mockResolvedValueOnce(challenge());
  const outcome = track(ensureTarkovAccess());
  await settle();
  return { outcome };
};
const solveWidget = async () => {
  widget.solved.value = true;
  await settle();
};
const releaseAfterChallenge = async () => {
  const { outcome } = await startChallengedRequest();
  network.mockResolvedValueOnce(json()).mockResolvedValueOnce(json());
  await solveWidget();
  return outcome;
};
beforeEach(async () => {
  fetchAllData.mockReset();
  fetchAllData.mockResolvedValue(undefined);
  resetTarkovAccessForTests();
  await flushPromises();
  resetTarkovAccessForTests();
  config.mockReturnValue({
    public: { tarkovAccessEnabled: true, tarkovAccessSiteKey: 'site-key' },
  });
  network = vi.fn();
  vi.stubGlobal('fetch', network);
  widget = createWidget();
  useTurnstileWidgetMock.mockImplementation(() => widget);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('TarkovAccessGate', () => {
  it('stays hidden and non-dismissible while idle, probing, and released', async () => {
    const wrapper = await mountGate();
    expect(isVisible(wrapper)).toBe(false);
    expect(modal(wrapper).props()).toMatchObject({
      open: false,
      dismissible: false,
      close: false,
      title: 'tarkov_access.title',
      description: 'tarkov_access.checking',
    });
    let releaseProbe: (response: Response) => void = () => {};
    network.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          releaseProbe = resolve;
        })
    );
    const outcome = track(ensureTarkovAccess());
    await settle();
    expect(getTarkovAccessState().phase.value).toBe('probing');
    expect(isVisible(wrapper)).toBe(false);
    releaseProbe(json());
    await settle();
    expect(getTarkovAccessState().phase.value).toBe('released');
    expect(isVisible(wrapper)).toBe(false);
    expect(outcome).toEqual({ state: 'fulfilled', value: 1 });
  });
  it.each([
    [403, 'blocked'],
    [429, 'rate_limited'],
    [500, 'failed'],
  ])(
    'keeps an ordinary %i probe failure before any challenge out of the gate',
    async (status, kind) => {
      const wrapper = await mountGate();
      network.mockResolvedValueOnce(json({}, status));
      const outcome = track(ensureTarkovAccess());
      await settle();
      expect(outcome.state).toBe('rejected');
      expect(outcome.value).toMatchObject({ kind });
      expect(getTarkovAccessState().challengeSeen.value).toBe(false);
      expect(isVisible(wrapper)).toBe(false);
    }
  );
  it('renders the widget with the description copy on a challenge', async () => {
    const wrapper = await mountGate();
    const { outcome } = await startChallengedRequest();
    expect(isVisible(wrapper)).toBe(true);
    expect(modal(wrapper).props('description')).toBe('tarkov_access.description');
    expect(statusText(wrapper)).toBe('tarkov_access.description');
    expect(wrapper.text()).toContain('tarkov_access.widget_hint');
    expect(hasWidget(wrapper)).toBe(true);
    expect(retryButton(wrapper).exists()).toBe(false);
    const [containerRef, options] = useTurnstileWidgetMock.mock.calls[0]!;
    expect(options).toEqual({ siteKey: 'site-key', action: TARKOV_ACCESS_WIDGET_ACTION });
    expect(containerRef.value).toBe(
      wrapper.find('[data-testid="tarkov-access-gate-widget"]').element
    );
    expect(widget.getToken).not.toHaveBeenCalled();
    expect(outcome.state).toBe('pending');
  });
  it('submits a solved token once, shows verifying copy, and releases access', async () => {
    const wrapper = await mountGate();
    const { outcome } = await startChallengedRequest();
    let releaseVerify: (response: Response) => void = () => {};
    network.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          releaseVerify = resolve;
        })
    );
    await solveWidget();
    expect(getTarkovAccessState().phase.value).toBe('verifying');
    expect(isVisible(wrapper)).toBe(true);
    expect(modal(wrapper).props('description')).toBe('tarkov_access.verifying');
    expect(hasWidget(wrapper)).toBe(false);
    expect(retryButton(wrapper).exists()).toBe(false);
    network.mockResolvedValueOnce(json());
    releaseVerify(json());
    await settle();
    expect(outcome).toEqual({ state: 'fulfilled', value: 1 });
    expect(isVisible(wrapper)).toBe(false);
    widget.solved.value = false;
    await settle();
    expect(widget.getToken).toHaveBeenCalledTimes(1);
    expect(verifyBodies(network)).toEqual([JSON.stringify({ token: 'widget-token' })]);
  });
  it('parks the attempt when the solved widget yields no token', async () => {
    const wrapper = await mountGate();
    const { outcome } = await startChallengedRequest();
    widget.getToken.mockResolvedValueOnce(null);
    await solveWidget();
    expect(getTarkovAccessState().attemptsExhausted.value).toBe(true);
    expect(network).toHaveBeenCalledTimes(1);
    expect(modal(wrapper).props('description')).toBe('tarkov_access.verification_failed_retry');
    expect(hasWidget(wrapper)).toBe(false);
    expect(retryButton(wrapper).text()).toBe('tarkov_access.retry');
    expect(outcome.state).toBe('pending');
  });
  it('parks the attempt when the widget becomes unavailable', async () => {
    const wrapper = await mountGate();
    const { outcome } = await startChallengedRequest();
    widget.unavailable.value = true;
    await settle();
    expect(getTarkovAccessState().attemptsExhausted.value).toBe(true);
    expect(retryButton(wrapper).exists()).toBe(true);
    widget.unavailable.value = false;
    await settle();
    expect(network).toHaveBeenCalledTimes(1);
    expect(getTarkovAccessState().phase.value).toBe('challenge');
    expect(outcome.state).toBe('pending');
  });
  it('reports an unavailable widget immediately when no site key is configured', async () => {
    config.mockReturnValue({ public: { tarkovAccessEnabled: true } });
    widget.enabled = false;
    const wrapper = await mountGate();
    expect(useTurnstileWidgetMock).toHaveBeenCalledWith(expect.anything(), {
      siteKey: '',
      action: TARKOV_ACCESS_WIDGET_ACTION,
    });
    const { outcome } = await startChallengedRequest();
    expect(getTarkovAccessState().attemptsExhausted.value).toBe(true);
    expect(network).toHaveBeenCalledTimes(1);
    expect(isVisible(wrapper)).toBe(true);
    expect(hasWidget(wrapper)).toBe(false);
    expect(modal(wrapper).props('description')).toBe('tarkov_access.verification_failed_retry');
    expect(retryButton(wrapper).exists()).toBe(true);
    expect(widget.getToken).not.toHaveBeenCalled();
    expect(outcome.state).toBe('pending');
  });
  it('explains a widget that cannot render with the widget-unavailable copy', async () => {
    widget.enabled = false;
    const wrapper = await mountGate();
    await startChallengedRequest();
    expect(isVisible(wrapper)).toBe(true);
    expect(hasWidget(wrapper)).toBe(false);
    expect(modal(wrapper).props('description')).toBe('tarkov_access.widget_unavailable');
  });
  it('resets the widget once per attempt epoch', async () => {
    const wrapper = await mountGate();
    expect(widget.reset).not.toHaveBeenCalled();
    await releaseAfterChallenge();
    expect(widget.reset).toHaveBeenCalledTimes(1);
    network.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(challenge());
    const request = track(tarkovApiFetch('/api/tarkov/items'));
    await settle();
    expect(getTarkovAccessState().attemptEpoch.value).toBe(2);
    expect(widget.reset).toHaveBeenCalledTimes(2);
    expect(hasWidget(wrapper)).toBe(true);
    widget.getToken.mockResolvedValueOnce('second-token');
    network
      .mockResolvedValueOnce(json())
      .mockResolvedValueOnce(json())
      .mockResolvedValueOnce(json({ value: 5 }));
    await solveWidget();
    expect(request).toEqual({ state: 'fulfilled', value: { value: 5 } });
    expect(verifyBodies(network)).toEqual([
      JSON.stringify({ token: 'widget-token' }),
      JSON.stringify({ token: 'second-token' }),
    ]);
    expect(isVisible(wrapper)).toBe(false);
  });
  it.each([
    [403, 'blocked'],
    [429, 'rate_limited'],
    [500, 'failed'],
  ])('shows a %i re-probe failure copy with a retry that releases access', async (status, kind) => {
    const wrapper = await mountGate();
    const { outcome } = await startChallengedRequest();
    network.mockResolvedValueOnce(json()).mockResolvedValueOnce(json({}, status));
    await solveWidget();
    expect(getTarkovAccessState().phase.value).toBe(kind);
    expect(isVisible(wrapper)).toBe(true);
    expect(modal(wrapper).props('description')).toBe(`tarkov_access.${kind}`);
    expect(hasWidget(wrapper)).toBe(false);
    expect(outcome.state).toBe('pending');
    const resetsBeforeRetry = widget.reset.mock.calls.length;
    network.mockResolvedValueOnce(json());
    await retryButton(wrapper).trigger('click');
    await settle();
    expect(widget.reset).toHaveBeenCalledTimes(resetsBeforeRetry + 2);
    expect(getTarkovAccessState().phase.value).toBe('released');
    expect(isVisible(wrapper)).toBe(false);
    expect(outcome).toEqual({ state: 'fulfilled', value: 2 });
  });
  it('restarts the challenge from the retry button after an exhausted attempt', async () => {
    const wrapper = await mountGate();
    const { outcome } = await startChallengedRequest();
    widget.getToken.mockResolvedValueOnce(null);
    await solveWidget();
    network.mockResolvedValueOnce(challenge());
    await retryButton(wrapper).trigger('click');
    await settle();
    expect(getTarkovAccessState().attemptsExhausted.value).toBe(false);
    expect(modal(wrapper).props('description')).toBe('tarkov_access.description');
    expect(hasWidget(wrapper)).toBe(true);
    expect(retryButton(wrapper).exists()).toBe(false);
    network.mockResolvedValueOnce(json()).mockResolvedValueOnce(json());
    await solveWidget();
    expect(outcome).toEqual({ state: 'fulfilled', value: 2 });
    expect(verifyBodies(network)).toEqual([JSON.stringify({ token: 'widget-token' })]);
  });
  it('keeps a failed manual retry visible and parked until the next retry', async () => {
    const wrapper = await mountGate();
    const { outcome } = await startChallengedRequest();
    widget.unavailable.value = true;
    await settle();
    network.mockRejectedValueOnce(new TypeError('offline'));
    await retryButton(wrapper).trigger('click');
    await settle();
    expect(logger.debug).toHaveBeenCalledWith(
      '[TarkovAccessGate] Manual access retry failed:',
      expect.objectContaining({ kind: 'failed' })
    );
    expect(getTarkovAccessState().phase.value).toBe('failed');
    expect(isVisible(wrapper)).toBe(true);
    expect(retryButton(wrapper).exists()).toBe(true);
    expect(outcome.state).toBe('pending');
    network.mockResolvedValueOnce(json());
    await retryButton(wrapper).trigger('click');
    await settle();
    expect(outcome).toEqual({ state: 'fulfilled', value: 3 });
    expect(isVisible(wrapper)).toBe(false);
  });
  it('dismisses a parked gate and keeps it closed for later requests', async () => {
    const wrapper = await mountGate();
    const { outcome } = await startChallengedRequest();
    widget.unavailable.value = true;
    await settle();
    await dismissButton(wrapper).trigger('click');
    await settle();
    expect(isVisible(wrapper)).toBe(false);
    expect(outcome.state).toBe('rejected');
    expect(outcome.value).toMatchObject({ kind: 'challenge' });
    network.mockResolvedValue(challenge());
    const later = track(tarkovApiFetch('/api/tarkov/hideout'));
    await settle();
    expect(later.state).toBe('rejected');
    expect(isVisible(wrapper)).toBe(false);
    expect(network).toHaveBeenCalledTimes(1);
  });
  it('offers a non-modal verify action after dismissal that reloads metadata', async () => {
    fetchAllData.mockResolvedValue(undefined);
    const wrapper = await mountGate();
    await startChallengedRequest();
    await dismissButton(wrapper).trigger('click');
    await settle();
    const notice = wrapper.find('[data-testid="tarkov-access-dismissed"]');
    expect(notice.text()).toContain('tarkov_access.dismissed_notice');
    network.mockResolvedValueOnce(challenge());
    await wrapper.find('[data-testid="tarkov-access-dismissed-verify"]').trigger('click');
    await settle();
    expect(isVisible(wrapper)).toBe(true);
    expect(wrapper.find('[data-testid="tarkov-access-dismissed"]').exists()).toBe(false);
    network.mockResolvedValueOnce(json()).mockResolvedValueOnce(json());
    await solveWidget();
    expect(getTarkovAccessState().phase.value).toBe('released');
    expect(fetchAllData).toHaveBeenCalledWith(false);
    expect(isVisible(wrapper)).toBe(false);
  });
  it('reloads metadata when a later retry recovers from a failed verify action', async () => {
    const wrapper = await mountGate();
    await startChallengedRequest();
    await dismissButton(wrapper).trigger('click');
    await settle();
    network.mockResolvedValueOnce(challenge());
    await wrapper.find('[data-testid="tarkov-access-dismissed-verify"]').trigger('click');
    await settle();
    widget.unavailable.value = true;
    await settle();
    expect(retryButton(wrapper).exists()).toBe(true);
    expect(fetchAllData).not.toHaveBeenCalled();
    widget.unavailable.value = false;
    network.mockResolvedValueOnce(json());
    await retryButton(wrapper).trigger('click');
    await settle();
    expect(getTarkovAccessState().phase.value).toBe('released');
    expect(fetchAllData).toHaveBeenCalledTimes(1);
    expect(fetchAllData).toHaveBeenCalledWith(false);
  });
  it('logs a failed metadata reload after access recovery', async () => {
    fetchAllData.mockRejectedValueOnce(new Error('reload failed'));
    const wrapper = await mountGate();
    await startChallengedRequest();
    await dismissButton(wrapper).trigger('click');
    await settle();
    network.mockResolvedValueOnce(json());
    await wrapper.find('[data-testid="tarkov-access-dismissed-verify"]').trigger('click');
    await settle();
    expect(logger.debug).toHaveBeenCalledWith(
      '[TarkovAccessGate] Metadata reload after access recovery failed:',
      expect.objectContaining({ message: 'reload failed' })
    );
  });
  it('logs a failed verify action after dismissal without reloading metadata', async () => {
    const wrapper = await mountGate();
    await startChallengedRequest();
    await dismissButton(wrapper).trigger('click');
    await settle();
    network.mockRejectedValueOnce(new TypeError('offline'));
    await wrapper.find('[data-testid="tarkov-access-dismissed-verify"]').trigger('click');
    await settle();
    expect(logger.debug).toHaveBeenCalledWith(
      '[TarkovAccessGate] Access retry after dismissal failed:',
      expect.objectContaining({ kind: 'failed' })
    );
    expect(fetchAllData).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="tarkov-access-dismissed"]').exists()).toBe(false);
  });
  it('disables retries for the Retry-After delay of a rate-limited verification', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const wrapper = await mountGate();
    await startChallengedRequest();
    network.mockResolvedValueOnce(
      new Response('{}', { status: 429, headers: { 'Retry-After': '30' } })
    );
    await solveWidget();
    expect(getTarkovAccessState().phase.value).toBe('rate_limited');
    expect(statusText(wrapper)).toBe('tarkov_access.rate_limited');
    expect(retryButton(wrapper).attributes('disabled')).toBeDefined();
    await vi.advanceTimersByTimeAsync(30_000);
    await settle();
    expect(retryButton(wrapper).attributes('disabled')).toBeUndefined();
    wrapper.unmount();
    vi.useRealTimers();
  });
  it('dismisses an open challenge without verifying a token', async () => {
    const wrapper = await mountGate();
    const { outcome } = await startChallengedRequest();
    expect(hasWidget(wrapper)).toBe(true);
    await dismissButton(wrapper).trigger('click');
    await settle();
    expect(isVisible(wrapper)).toBe(false);
    expect(outcome.state).toBe('rejected');
    expect(getTarkovAccessState().attemptsExhausted.value).toBe(false);
    expect(verifyBodies(network)).toEqual([]);
  });
  it.each([
    ['403', () => Promise.resolve(json({}, 403)), 'blocked'],
    ['429', () => Promise.resolve(json({}, 429)), 'rate_limited'],
    ['500', () => Promise.resolve(json({}, 500)), 'failed'],
    ['network error', () => Promise.reject(new TypeError('offline')), 'failed'],
  ])(
    'keeps the gate hidden when a renewal probe fails with %s after a challenge',
    async (_label, respond, kind) => {
      const wrapper = await mountGate();
      expect(await releaseAfterChallenge()).toEqual({ state: 'fulfilled', value: 1 });
      network.mockResolvedValueOnce(challenge()).mockImplementationOnce(respond);
      const renewal = track(tarkovApiFetch('/api/tarkov/items'));
      await settle();
      expect(renewal.state).toBe('rejected');
      expect(renewal.value).toMatchObject({ kind });
      expect(getTarkovAccessState().challengeSeen.value).toBe(true);
      expect(getTarkovAccessState().phase.value).toBe('idle');
      expect(isVisible(wrapper)).toBe(false);
      expect(retryButton(wrapper).exists()).toBe(false);
      network.mockResolvedValueOnce(json()).mockResolvedValueOnce(json({ value: 3 }));
      const next = track(tarkovApiFetch('/api/tarkov/items'));
      await settle();
      expect(next).toEqual({ state: 'fulfilled', value: { value: 3 } });
      expect(isVisible(wrapper)).toBe(false);
    }
  );
  it('never overlays or resets the widget when mounted with the feature disabled', async () => {
    const { outcome } = await startChallengedRequest();
    expect(getTarkovAccessState().challengeSeen.value).toBe(true);
    config.mockReturnValue({
      public: { tarkovAccessEnabled: false, tarkovAccessSiteKey: 'site-key' },
    });
    const wrapper = await mountGate();
    expect(isVisible(wrapper)).toBe(false);
    config.mockReturnValue({
      public: { tarkovAccessEnabled: true, tarkovAccessSiteKey: 'site-key' },
    });
    reportGateWidgetUnavailable();
    await settle();
    expect(getTarkovAccessState().attemptsExhausted.value).toBe(true);
    expect(isVisible(wrapper)).toBe(false);
    network.mockResolvedValueOnce(json());
    await requestGateRetry();
    await settle();
    expect(getTarkovAccessState().attemptEpoch.value).toBe(2);
    expect(widget.reset).not.toHaveBeenCalled();
    expect(outcome).toEqual({ state: 'fulfilled', value: 2 });
  });
});
