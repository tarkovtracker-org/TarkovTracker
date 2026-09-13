// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import AccountDeletionStatus from '@/features/settings/AccountDeletionStatus.vue';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
mockNuxtImport('useNuxtApp', () => () => ({ $supabase: { client: { functions: { invoke } } } }));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
const mountStatus = async () => {
  const wrapper = mount(AccountDeletionStatus, {
    global: {
      stubs: {
        UAlert: { props: ['title', 'description'], template: '<p>{{ description }}</p>' },
        UButton: {
          props: ['disabled', 'loading'],
          emits: ['click'],
          template:
            '<button :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  });
  await flushPromises();
  return wrapper;
};
beforeEach(() => invoke.mockReset());
it('waiting account displays reversible status and sends only a cancellation action', async () => {
  invoke.mockResolvedValueOnce({ data: { state: 'provider_wait', can_cancel: true }, error: null });
  const wrapper = await mountStatus();
  expect(wrapper.text()).toContain('deletion_waiting');
  invoke.mockResolvedValueOnce({ data: { state: 'cancelled', can_cancel: false }, error: null });
  await wrapper.findAll('button')[1]!.trigger('click');
  await flushPromises();
  expect(invoke).toHaveBeenLastCalledWith('account-deletion-state', { body: { action: 'cancel' } });
  expect(wrapper.text()).toContain('deletion_withdrawn');
  expect(wrapper.findAll('button')).toHaveLength(1);
});
it('prepared account displays restrictions without offering withdrawal', async () => {
  invoke.mockResolvedValue({ data: { state: 'prepared', can_cancel: false }, error: null });
  const wrapper = await mountStatus();
  expect(wrapper.text()).toContain('deletion_preparing');
  expect(wrapper.findAll('button')).toHaveLength(1);
});
it('failed status lookup does not claim completion or expose provider errors', async () => {
  invoke.mockResolvedValue({ data: null, error: new Error('synthetic-private-provider-detail') });
  const wrapper = await mountStatus();
  expect(wrapper.text()).toContain('deletion_status_unavailable');
  expect(wrapper.text()).not.toContain('synthetic-private-provider-detail');
});
it('completed workflow is hidden rather than described as preparing', async () => {
  invoke.mockResolvedValue({ data: { state: 'completed', can_cancel: false }, error: null });
  expect((await mountStatus()).find('section').exists()).toBe(false);
});
it('failed refresh removes stale withdrawal action', async () => {
  invoke.mockResolvedValueOnce({ data: { state: 'provider_wait', can_cancel: true }, error: null });
  const wrapper = await mountStatus();
  invoke.mockRejectedValueOnce(new Error('unavailable'));
  await wrapper.findAll('button')[0]!.trigger('click');
  await flushPromises();
  expect(wrapper.findAll('button')).toHaveLength(1);
});
