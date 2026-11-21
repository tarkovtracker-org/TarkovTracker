// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import ProfileHandleSettings from '@/features/settings/ProfileHandleSettings.vue';
import ProfileSharingCard from '@/features/settings/ProfileSharingCard.vue';
const { maybeSingle, insert, copyToClipboard } = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  insert: vi.fn(),
  copyToClipboard: vi.fn(),
}));
const user = reactive({ id: 'account-one', loggedIn: true });
const preferences = reactive({ getStreamerMode: false });
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user,
    client: {
      from: (table: string) => ({
        insert,
        select: () => ({
          eq: () => {
            if (table === 'user_game_mode_progress') {
              return { data: [{ game_mode: 'pve', season_number: 0, profile_public: true }] };
            }
            if (table === 'profile_handles') return { maybeSingle };
            return { maybeSingle: async () => ({ data: null }) };
          },
        }),
      }),
    },
  },
}));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
mockNuxtImport('usePreferencesStore', () => () => preferences);
mockNuxtImport('useTarkovStore', () => () => ({
  getTarkovUid: () => 1234,
  getDisplayName: () => 'Rat_One',
}));
mockNuxtImport('useCopyToClipboard', () => () => ({ copyToClipboard }));
const createWrapper = () =>
  mount(ProfileHandleSettings, {
    props: { modelValue: null, hasPublicMode: false },
    global: {
      stubs: {
        UFormField: {
          props: ['error'],
          template: '<div><slot /><span>{{ error }}</span></div>',
        },
        UInput: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
        UButton: {
          props: ['type'],
          template: '<button :type="type || \'button\'"><slot /></button>',
        },
      },
    },
  });
describe('profile handle settings', () => {
  beforeEach(() => {
    user.id = 'account-one';
    preferences.getStreamerMode = false;
    maybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
    insert.mockReset().mockResolvedValue({ error: null });
    copyToClipboard.mockClear();
  });
  it('suggests a PMC name and only publishes its URL after a mode becomes public', async () => {
    const wrapper = createWrapper();
    await flushPromises();
    await wrapper.get('button[type="button"]').trigger('click');
    expect(wrapper.get('input').element.value).toBe('rat_one');
    expect(insert).not.toHaveBeenCalled();
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(insert).toHaveBeenCalledWith({ handle: 'rat_one', user_id: 'account-one' });
    expect(wrapper.emitted('update:modelValue')).toEqual([['rat_one']]);
    expect(wrapper.text()).toContain('@rat_one');
    expect(wrapper.find('a').exists()).toBe(false);
    await wrapper.setProps({ hasPublicMode: true });
    const url = wrapper.get('a').attributes('href');
    expect(new URL(url!).pathname).toBe('/@rat_one');
    await wrapper.get('button').trigger('click');
    expect(copyToClipboard).toHaveBeenCalledWith(url);
    preferences.getStreamerMode = true;
    await flushPromises();
    expect(wrapper.find('a').exists()).toBe(false);
  });
  it.each([
    ['23505', 'handle_taken'],
    ['23514', 'handle_invalid'],
    ['57014', 'handle_failed'],
  ])('keeps the form usable after the database returns %s', async (code, message) => {
    insert.mockResolvedValueOnce({ error: { code } });
    const wrapper = createWrapper();
    await flushPromises();
    await wrapper.get('input').setValue('RAT_ONE');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(insert).toHaveBeenCalledWith({ handle: 'rat_one', user_id: 'account-one' });
    expect(wrapper.text()).toContain(`settings.profile_sharing.${message}`);
    expect(wrapper.get('input').element.value).toBe('RAT_ONE');
  });
  it('rejects malformed input before sending a claim', async () => {
    const wrapper = createWrapper();
    await flushPromises();
    await wrapper.get('input').setValue('bad/name');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain('settings.profile_sharing.handle_invalid');
    expect(insert).not.toHaveBeenCalled();
  });
  it('retries a failed read and reloads the claim when the account changes', async () => {
    maybeSingle
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ data: { handle: 'rat_one' }, error: null });
    const wrapper = createWrapper();
    await flushPromises();
    expect(wrapper.text()).toContain('settings.profile_sharing.handle_failed');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('@rat_one');
    user.id = 'account-two';
    await flushPromises();
    expect(wrapper.text()).not.toContain('@rat_one');
    expect(wrapper.find('form').exists()).toBe(true);
    expect(insert).not.toHaveBeenCalled();
  });
  it('shows only the shared mode URL and switches to an anonymous link in Streamer Mode', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { handle: 'rat_one' }, error: null });
    const wrapper = mount(ProfileSharingCard, {
      global: {
        stubs: {
          GenericCard: { template: '<div><slot name="content" /></div>' },
          UBadge: true,
          UButton: true,
          USwitch: true,
        },
      },
    });
    await flushPromises();
    const getPaths = () =>
      wrapper.findAll('a').map((link) => new URL(link.attributes('href')!).pathname);
    expect(getPaths()).toEqual(['/@rat_one', '/@rat_one/pve']);
    preferences.getStreamerMode = true;
    await flushPromises();
    expect(getPaths()).toEqual(['/profile/account-one/pve']);
  });
});
