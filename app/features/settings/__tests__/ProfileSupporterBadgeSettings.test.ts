// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import ProfileSupporterBadgeSettings from '@/features/settings/ProfileSupporterBadgeSettings.vue';
const { maybeSingle, upsert } = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
}));
const isSupporter = ref(true);
const loadedUserId = ref('account-one');
mockNuxtImport('useSupporter', () => () => ({ isSupporter, loadedUserId }));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user: { id: 'account-one', loggedIn: true },
    client: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle }) }),
        upsert,
      }),
    },
  },
}));
const render = () =>
  mount(ProfileSupporterBadgeSettings, {
    global: {
      stubs: {
        USwitch: {
          props: ['modelValue', 'disabled'],
          emits: ['update:model-value'],
          template:
            '<button :aria-pressed="modelValue" :disabled="disabled" @click="$emit(\'update:model-value\', !modelValue)">Share</button>',
        },
      },
    },
  });
describe('profile supporter badge visibility', () => {
  beforeEach(() => {
    isSupporter.value = true;
    loadedUserId.value = 'account-one';
    maybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
    upsert.mockReset().mockResolvedValue({ error: null });
  });
  it('defaults to private and persists the owner choice in either direction', async () => {
    const wrapper = render();
    await flushPromises();
    const toggle = wrapper.get('button');
    expect(toggle.attributes('aria-pressed')).toBe('false');
    expect(upsert).not.toHaveBeenCalled();
    await toggle.trigger('click');
    await flushPromises();
    expect(upsert).toHaveBeenLastCalledWith(
      { user_id: 'account-one', show_supporter_badge: true },
      { onConflict: 'user_id', defaultToNull: false }
    );
    expect(toggle.attributes('aria-pressed')).toBe('true');
    await toggle.trigger('click');
    await flushPromises();
    expect(upsert).toHaveBeenLastCalledWith(
      { user_id: 'account-one', show_supporter_badge: false },
      { onConflict: 'user_id', defaultToNull: false }
    );
    expect(toggle.attributes('aria-pressed')).toBe('false');
  });
  it('keeps the confirmed setting if saving fails', async () => {
    upsert.mockResolvedValueOnce({ error: { code: '42501' } });
    const wrapper = render();
    await flushPromises();
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('[role="alert"]').text()).toContain('supporter_badge_failed');
  });
  it('does not show the switch based on another account’s supporter status', async () => {
    loadedUserId.value = 'previous-account';
    const wrapper = render();
    await flushPromises();
    expect(wrapper.find('button').exists()).toBe(false);
  });
});
