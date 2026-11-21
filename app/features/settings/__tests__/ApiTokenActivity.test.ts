// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
mockNuxtImport('useNuxtApp', () => () => ({ $supabase: { client: { rpc: mockRpc } } }));
mockNuxtImport('useI18n', () => () => ({
  t: (key: string) => key.split('.').at(-1),
  locale: ref('en'),
}));
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }));
const request = {
  id: 'request',
  occurred_at: '2026-11-21T13:00:00Z',
  endpoint: 'GET /progress',
  client: 'test-client',
  status: 200,
  kind: 'read',
  outcome: 'counted',
};
const activity = {
  summary: { requests: 1, counted: 1, throttled: 0 },
  requests: [request],
  buckets: [],
  endpoints: [],
  clients: [],
  quota: [],
};
describe('ApiTokenActivity', () => {
  it('keeps the existing history mounted while applying a throttle filter', async () => {
    mockRpc.mockReset();
    const plain = Promise.resolve({ data: activity, error: null });
    const pending = Promise.withResolvers<{ data: typeof activity; error: null }>();
    mockRpc
      .mockReturnValueOnce({ abortSignal: () => plain })
      .mockReturnValueOnce({ abortSignal: () => pending.promise });
    const { default: ApiTokenActivity } = await import('@/features/settings/ApiTokenActivity.vue');
    const wrapper = mount(ApiTokenActivity, {
      props: { title: 'Activity' },
      global: {
        stubs: {
          ApiTokenActivityChart: true,
          ApiTokenQuota: true,
          UFormField: { template: '<div><slot /></div>' },
          USelect: true,
          UButton: {
            props: ['disabled'],
            template: '<button :disabled="disabled"><slot /></button>',
          },
          UCheckbox: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template:
              '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)">',
          },
        },
      },
    });
    await flushPromises();
    const table = wrapper.get('table').element;
    const row = wrapper.get('tbody tr').element;
    await wrapper.get('input[type="checkbox"]').setValue(true);
    expect(mockRpc).toHaveBeenLastCalledWith(
      'get_api_request_activity',
      expect.objectContaining({ p_throttle_only: true })
    );
    expect(wrapper.get('table').element).toBe(table);
    expect(wrapper.get('tbody tr').element).toBe(row);
    const copy = wrapper.findAll('button').find((button) => button.text() === 'copy_evidence');
    expect(copy?.attributes('disabled')).toBeDefined();
    pending.resolve({
      error: null,
      data: {
        ...activity,
        summary: { requests: 1, counted: 0, throttled: 1 },
        requests: [{ ...request, id: 'throttle', status: 429, outcome: 'throttled' }],
      },
    });
    await flushPromises();
    expect(wrapper.get('table').element).toBe(table);
    expect(wrapper.get('tbody').text()).toContain('429');
    expect(wrapper.get('tbody').text()).not.toContain('200');
    wrapper.unmount();
  });
});
