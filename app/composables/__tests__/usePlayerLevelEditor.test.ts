import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { defineStore } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { parsePlayerLevel } from '@/composables/usePlayerLevelEditor';
import DrawerLevel from '@/features/drawer/DrawerLevel.vue';
import PlayerLevelCard from '@/features/settings/PlayerLevelCard.vue';
import { actions, defaultState, getters, type UserState } from '@/stores/progressState';
const { metadata, toastAdd } = vi.hoisted(() => ({
  metadata: {
    loading: false,
    minPlayerLevel: 1,
    maxPlayerLevel: 79,
    playerLevels: [] as { level: number }[],
  },
  toastAdd: vi.fn(),
}));
// The real per-mode level getters/actions, so writes land on the mode that was active.
const useLevelTestStore = defineStore('playerLevelEditorTest', {
  state: (): UserState => structuredClone(defaultState),
  getters: {
    getCurrentGameMode: getters.getCurrentGameMode,
    playerLevel: getters.playerLevel,
  },
  actions: {
    setLevel: actions.setLevel,
    switchGameMode: actions.switchGameMode,
  },
});
vi.mock('@/stores/useTarkov', () => ({ useTarkovStore: () => useLevelTestStore() }));
vi.mock('@/stores/useMetadata', () => ({ useMetadataStore: () => metadata }));
mockNuxtImport('useToast', () => () => ({ add: toastAdd }));
// Both mounts share one Nuxt app, so they must also share stubs for re-renders to match.
const STUBS = { AppTooltip: { template: '<span><slot /></span>' }, UIcon: true };
const mountDrawer = () =>
  mountSuspended(DrawerLevel, { props: { isCollapsed: false }, global: { stubs: STUBS } });
const mountCard = () => mountSuspended(PlayerLevelCard, { global: { stubs: STUBS } });
type Wrapper = Awaited<ReturnType<typeof mountCard>>;
const cardInput = (wrapper: Wrapper) => wrapper.get<HTMLInputElement>('input[name="player-level"]');
const applyButton = (wrapper: Wrapper) => wrapper.get<HTMLButtonElement>('button[type="submit"]');
async function submitCard(wrapper: Wrapper, value: string) {
  await cardInput(wrapper).setValue(value);
  await wrapper.get('form').trigger('submit');
}
async function openDrawerEditor(wrapper: Awaited<ReturnType<typeof mountDrawer>>) {
  await wrapper.get('[role="button"]').trigger('click');
  return wrapper.get<HTMLInputElement>('input');
}
let store: ReturnType<typeof useLevelTestStore>;
beforeEach(() => {
  store = useLevelTestStore();
  store.$reset();
  store.pvp.level = 37;
  store.pve.level = 12;
  metadata.minPlayerLevel = 1;
  metadata.maxPlayerLevel = 79;
  metadata.playerLevels = [{ level: 1 }, { level: 79 }];
  toastAdd.mockReset();
});
describe('parsePlayerLevel', () => {
  const bounds = { min: 1, max: 79 };
  it.each([
    ['1', 1],
    ['79', 79],
    [' 42 ', 42],
    [42, 42],
  ])('accepts %j', (raw, level) => {
    expect(parsePlayerLevel(raw, bounds)).toEqual({ ok: true, level });
  });
  it.each([
    ['', 'required'],
    ['   ', 'required'],
    [null, 'required'],
    ['1.5', 'whole_number'],
    [1.5, 'whole_number'],
    ['abc', 'whole_number'],
    ['0', 'out_of_range'],
    ['80', 'out_of_range'],
    ['-1', 'out_of_range'],
  ])('rejects %j as %s instead of clamping', (raw, error) => {
    expect(parsePlayerLevel(raw, bounds)).toEqual({ ok: false, error });
  });
});
describe('Settings current level card', () => {
  it('uses metadata bounds for hints, validation, and saves', async () => {
    metadata.minPlayerLevel = 10;
    metadata.maxPlayerLevel = 40;
    metadata.playerLevels = [{ level: 10 }, { level: 40 }];
    const wrapper = await mountCard();
    expect(wrapper.text()).toContain('Enter a whole number from 10 to 40.');
    for (const value of ['9', '41']) {
      await submitCard(wrapper, value);
      expect(wrapper.text()).toContain('Level must be between 10 and 40.');
      expect(applyButton(wrapper).element.disabled).toBe(true);
      expect(store.pvp.level).toBe(37);
    }
    for (const value of ['10', '40']) {
      await submitCard(wrapper, value);
      expect(store.pvp.level).toBe(Number(value));
    }
  });
  it('shows the supported range and applies a valid level to the active mode only', async () => {
    const wrapper = await mountCard();
    expect(wrapper.text()).toContain('Enter a whole number from 1 to 79.');
    expect(cardInput(wrapper).element.value).toBe('37');
    expect(applyButton(wrapper).element.disabled).toBe(true);
    await submitCard(wrapper, '42');
    expect(store.pvp.level).toBe(42);
    expect(store.pve.level).toBe(12);
    expect(toastAdd).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ color: 'success', description: 'Your PvP level is now 42.' })
    );
    expect(applyButton(wrapper).element.disabled).toBe(true);
  });
  it.each(['1', '79'])('accepts the %s boundary', async (value) => {
    const wrapper = await mountCard();
    await submitCard(wrapper, value);
    expect(store.pvp.level).toBe(Number(value));
  });
  it.each([
    ['80', 'Level must be between 1 and 79.'],
    ['0', 'Level must be between 1 and 79.'],
    ['', 'Enter a level from 1 to 79.'],
    ['2.5', 'Level must be a whole number.'],
  ])('explains and refuses %j without saving', async (value, message) => {
    const wrapper = await mountCard();
    await submitCard(wrapper, value);
    expect(wrapper.text()).toContain(message);
    expect(cardInput(wrapper).attributes('aria-invalid')).toBe('true');
    expect(applyButton(wrapper).element.disabled).toBe(true);
    expect(store.pvp.level).toBe(37);
    expect(toastAdd).not.toHaveBeenCalled();
  });
  it('uses the default range with a notice while level metadata is absent', async () => {
    metadata.playerLevels = [];
    const wrapper = await mountCard();
    expect(wrapper.text()).toContain('Using the default range until level data loads.');
    await submitCard(wrapper, '80');
    expect(store.pvp.level).toBe(37);
  });
  it('discards an unfinished draft when the mode switches instead of saving it there', async () => {
    const wrapper = await mountCard();
    await cardInput(wrapper).setValue('50');
    store.switchGameMode('pve');
    await nextTick();
    expect(cardInput(wrapper).element.value).toBe('12');
    await wrapper.get('form').trigger('submit');
    expect(store.pve.level).toBe(12);
    expect(store.pvp.level).toBe(37);
  });
  it('replaces an unfinished draft with hydrated progress', async () => {
    const wrapper = await mountCard();
    await cardInput(wrapper).setValue('50');
    store.$patch({ currentGameMode: 'pvp', pvp: { ...store.pvp, level: 20 } });
    await nextTick();
    expect(cardInput(wrapper).element.value).toBe('20');
    expect(applyButton(wrapper).element.disabled).toBe(true);
  });
});
describe('drawer level editor', () => {
  it('uses metadata bounds for validation and stepper limits', async () => {
    metadata.minPlayerLevel = 10;
    metadata.maxPlayerLevel = 40;
    metadata.playerLevels = [{ level: 10 }, { level: 40 }];
    const wrapper = await mountDrawer();
    const input = await openDrawerEditor(wrapper);
    expect(input.attributes('aria-label')).toBe('Current level, 10 to 40');
    for (const value of ['9', '41']) {
      await input.setValue(value);
      await input.trigger('keyup', { key: 'Enter' });
      expect(wrapper.get('[role="alert"]').text()).toBe('Level must be between 10 and 40.');
      expect(store.pvp.level).toBe(37);
    }
    await input.setValue('40');
    await input.trigger('keyup', { key: 'Enter' });
    expect(store.pvp.level).toBe(40);
    expect(wrapper.get('button[aria-label="Increase level"]').attributes()).toHaveProperty(
      'disabled'
    );
    store.setLevel(10);
    await nextTick();
    expect(wrapper.get('button[aria-label="Decrease level"]').attributes()).toHaveProperty(
      'disabled'
    );
  });
  it('keeps an invalid Enter open with feedback, then Escape restores the saved level', async () => {
    const wrapper = await mountDrawer();
    const input = await openDrawerEditor(wrapper);
    expect(input.attributes('aria-label')).toBe('Current level, 1 to 79');
    await input.setValue('80');
    await input.trigger('keyup', { key: 'Enter' });
    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toBe('Level must be between 1 and 79.');
    expect(input.attributes('aria-describedby')).toBe(alert.attributes('id'));
    expect(store.pvp.level).toBe(37);
    await input.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.get('[role="button"]').text()).toBe('37');
    expect(store.pvp.level).toBe(37);
  });
  it('discards an invalid value on blur instead of saving the minimum', async () => {
    const wrapper = await mountDrawer();
    const input = await openDrawerEditor(wrapper);
    await input.setValue('');
    await input.trigger('blur');
    expect(wrapper.find('input').exists()).toBe(false);
    expect(store.pvp.level).toBe(37);
  });
  it('saves a valid value on blur', async () => {
    const wrapper = await mountDrawer();
    const input = await openDrawerEditor(wrapper);
    await input.setValue('79');
    await input.trigger('blur');
    expect(store.pvp.level).toBe(79);
    expect(wrapper.find('button[aria-label="Increase level"]').attributes()).toHaveProperty(
      'disabled'
    );
  });
  it('closes an unfinished edit without writing when the mode switches', async () => {
    const wrapper = await mountDrawer();
    const input = await openDrawerEditor(wrapper);
    await input.setValue('50');
    store.switchGameMode('pve');
    await nextTick();
    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.get('[role="button"]').text()).toBe('12');
    expect(store.pvp.level).toBe(37);
    expect(store.pve.level).toBe(12);
  });
});
describe('shared editor state', () => {
  it('keeps the drawer and Settings editors on the same saved level', async () => {
    const drawer = await mountDrawer();
    const card = await mountCard();
    await submitCard(card, '30');
    await nextTick();
    expect(drawer.get('[role="button"]').text()).toBe('30');
    await drawer.get('button[aria-label="Increase level"]').trigger('click');
    await nextTick();
    expect(store.pvp.level).toBe(31);
    expect(cardInput(card).element.value).toBe('31');
    store.switchGameMode('pve');
    await nextTick();
    expect(drawer.get('[role="button"]').text()).toBe('12');
    expect(cardInput(card).element.value).toBe('12');
  });
});
