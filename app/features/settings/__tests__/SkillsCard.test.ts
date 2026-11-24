import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { useSkillCalculation } from '@/composables/useSkillCalculation';
import SkillsCard from '@/features/settings/SkillsCard.vue';
import { MAX_SKILL_LEVEL } from '@/utils/constants';
import { createTestLocaleMessages } from '#tests/test-helpers/i18nMessages';
const { preferencesState } = vi.hoisted(() => ({
  preferencesState: { sortMode: 'priority' as 'priority' | 'ingame' },
}));
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: createTestLocaleMessages(),
});
vi.mock('@/composables/useSkillCalculation');
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({
    get getSkillSortMode() {
      return preferencesState.sortMode;
    },
    setSkillSortMode: vi.fn(),
  }),
}));
mockNuxtImport('useToast', () => () => ({
  add: vi.fn(),
  remove: vi.fn(),
}));
const _GenericCard = { template: '<div><slot name="title-right" /><slot name="content" /></div>' };
const UInput = {
  template:
    '<input type="text" :value="modelValue" @keydown="$emit(\'keydown\', $event)" @focus="$emit(\'focus\')" @blur="$emit(\'blur\')" @input="$emit(\'update:model-value\', $event.target.value)" />',
  props: ['modelValue'],
};
const _UButton = {
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>',
  emits: ['click'],
};
const _UIcon = { template: '<div />' };
const _UTooltip = { template: '<div><slot /></div>' };
const _UBadge = { template: '<span class="badge"><slot /></span>' };
const _UModal = {
  template: '<div v-if="open" class="modal"><slot name="content" /></div>',
  props: ['open'],
};
type UseSkillCalculationMock = ReturnType<typeof useSkillCalculation>;
type GameSkill = UseSkillCalculationMock['allGameSkills']['value'][number];
const makeSkill = (key: string, overrides: Partial<GameSkill> = {}): GameSkill => ({
  key,
  id: key,
  name: key,
  requiredByTasks: [],
  requiredLevels: [],
  rewardedByTasks: [],
  ...overrides,
});
const createWrapper = (overrides: Partial<UseSkillCalculationMock> = {}) => {
  const defaultMock: UseSkillCalculationMock = {
    calculatedQuestSkills: computed(() => ({})),
    totalSkills: computed(() => ({})),
    allSkillNames: computed(() => []),
    allGameSkills: computed(() => [makeSkill('Strength')]),
    getSkillLevel: () => 10,
    getQuestSkillLevel: () => 5,
    getSkillOffset: () => 5,
    getSkillMetadata: () => null,
    setSkillOffset: vi.fn(),
    setTotalSkillLevel: vi.fn(() => true),
    resetSkillOffset: vi.fn(),
    migrateLegacySkillOffsets: vi.fn(() => false),
  };
  vi.mocked(useSkillCalculation).mockReturnValue({ ...defaultMock, ...overrides });
  return mount(SkillsCard, {
    global: {
      plugins: [i18n],
      stubs: {
        GenericCard: _GenericCard,
        UInput: UInput,
        UButton: _UButton,
        UIcon: _UIcon,
        UTooltip: _UTooltip,
        UBadge: _UBadge,
        UModal: _UModal,
        ULink: true,
        NuxtLink: true,
        Icon: true,
      },
      mocks: {
        $t: (key: string, fallback: unknown) => (typeof fallback === 'string' ? fallback : key),
      },
    },
  });
};
const findSkillInput = (wrapper: ReturnType<typeof createWrapper>, key = 'Strength') =>
  wrapper.find(`#skill-input-${key}`);
const findButton = (wrapper: ReturnType<typeof createWrapper>, text: string) =>
  wrapper.findAll('button').find((button) => button.text().includes(text));
describe('SkillsCard', () => {
  beforeEach(() => {
    preferencesState.sortMode = 'priority';
  });
  it('runs legacy offset migration when aliases are already available', () => {
    const migrateLegacySkillOffsets = vi.fn(() => false);
    createWrapper({ migrateLegacySkillOffsets });
    expect(migrateLegacySkillOffsets).toHaveBeenCalledTimes(1);
  });
  it('waits for aliases before running legacy offset migration', async () => {
    const allGameSkills = ref<GameSkill[]>([]);
    const migrateLegacySkillOffsets = vi.fn(() => false);
    createWrapper({
      allGameSkills: computed(() => allGameSkills.value),
      migrateLegacySkillOffsets,
    });
    expect(migrateLegacySkillOffsets).not.toHaveBeenCalled();
    allGameSkills.value = [makeSkill('Strength')];
    await nextTick();
    expect(migrateLegacySkillOffsets).toHaveBeenCalledTimes(1);
  });
  it('reruns legacy offset migration when aliases change without count changes', async () => {
    const allGameSkills = ref<GameSkill[]>([makeSkill('Strength')]);
    const migrateLegacySkillOffsets = vi.fn(() => false);
    createWrapper({
      allGameSkills: computed(() => allGameSkills.value),
      migrateLegacySkillOffsets,
    });
    expect(migrateLegacySkillOffsets).toHaveBeenCalledTimes(1);
    allGameSkills.value = [makeSkill('Strength', { name: 'Sila' })];
    await nextTick();
    expect(migrateLegacySkillOffsets).toHaveBeenCalledTimes(2);
  });
  it('prevents invalid characters on keydown', async () => {
    const setTotalSkillLevel = vi.fn(() => true);
    const wrapper = createWrapper({ setTotalSkillLevel });
    const input = findSkillInput(wrapper);
    const inputEl = input.element as HTMLInputElement;
    const dispatchKey = async (key: string, nextValue: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      inputEl.dispatchEvent(event);
      if (!event.defaultPrevented) {
        inputEl.value = nextValue;
        await input.trigger('input');
      }
    };
    inputEl.value = '10';
    inputEl.selectionStart = 2;
    inputEl.selectionEnd = 2;
    await dispatchKey('-', '10-');
    expect(inputEl.value).toBe('10');
    expect(setTotalSkillLevel).not.toHaveBeenCalled();
    inputEl.value = '10';
    inputEl.selectionStart = 2;
    inputEl.selectionEnd = 2;
    await dispatchKey('e', '10e');
    expect(inputEl.value).toBe('10');
    expect(setTotalSkillLevel).not.toHaveBeenCalled();
    inputEl.value = '10';
    inputEl.selectionStart = 2;
    inputEl.selectionEnd = 2;
    await dispatchKey('.', '10.');
    expect(inputEl.value).toBe('10.');
    expect(setTotalSkillLevel).not.toHaveBeenCalled();
    await dispatchKey('5', '10.5');
    expect(inputEl.value).toBe('10.5');
    expect(setTotalSkillLevel).toHaveBeenCalledWith('Strength', 10.5);
    setTotalSkillLevel.mockClear();
    inputEl.selectionStart = inputEl.value.length;
    inputEl.selectionEnd = inputEl.value.length;
    await dispatchKey('5', '10.55');
    expect(inputEl.value).toBe('10.55');
    expect(setTotalSkillLevel).toHaveBeenCalledWith('Strength', 10.55);
    setTotalSkillLevel.mockClear();
    inputEl.selectionStart = inputEl.value.length;
    inputEl.selectionEnd = inputEl.value.length;
    await dispatchKey('5', '10.555');
    expect(inputEl.value).toBe('10.55');
    expect(setTotalSkillLevel).not.toHaveBeenCalled();
    setTotalSkillLevel.mockClear();
    inputEl.value = '';
    inputEl.selectionStart = 0;
    inputEl.selectionEnd = 0;
    await dispatchKey('1', '1');
    expect(inputEl.value).toBe('1');
    expect(setTotalSkillLevel).toHaveBeenCalledWith('Strength', 1);
  });
  it(`prevents input resulting in value > ${MAX_SKILL_LEVEL}`, async () => {
    const wrapper = createWrapper({
      getSkillLevel: () => 5,
      getQuestSkillLevel: () => 0,
      getSkillOffset: () => 5,
      setTotalSkillLevel: vi.fn(() => true),
    });
    const input = findSkillInput(wrapper);
    const inputEl = input.element as HTMLInputElement;
    inputEl.value = '5';
    inputEl.selectionStart = 1;
    inputEl.selectionEnd = 1;
    const eventBlock = {
      key: '2',
      preventDefault: vi.fn(),
    };
    await input.trigger('keydown', eventBlock);
    expect(eventBlock.preventDefault).toHaveBeenCalled();
    inputEl.value = '5';
    inputEl.selectionStart = 1;
    inputEl.selectionEnd = 1;
    const eventAllow = {
      key: '1',
      preventDefault: vi.fn(),
    };
    await input.trigger('keydown', eventAllow);
    expect(eventAllow.preventDefault).not.toHaveBeenCalled();
    const maxSkillLevelInput = String(MAX_SKILL_LEVEL);
    inputEl.value = maxSkillLevelInput;
    inputEl.selectionStart = maxSkillLevelInput.length;
    inputEl.selectionEnd = maxSkillLevelInput.length;
    const eventLength = {
      key: '0',
      preventDefault: vi.fn(),
    };
    await input.trigger('keydown', eventLength);
    expect(eventLength.preventDefault).toHaveBeenCalled();
  });
  it('allows edits when displayed value is fractional', async () => {
    const wrapper = createWrapper({
      getSkillLevel: () => 1.5,
      setTotalSkillLevel: vi.fn(() => true),
    });
    const input = findSkillInput(wrapper);
    const inputEl = input.element as HTMLInputElement;
    inputEl.selectionStart = inputEl.value.length;
    inputEl.selectionEnd = inputEl.value.length;
    const event = {
      key: '1',
      preventDefault: vi.fn(),
    };
    await input.trigger('keydown', event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
  it("makes the skill row header the level input's native label for click-to-focus", () => {
    const wrapper = createWrapper();
    document.body.appendChild(wrapper.element);
    try {
      const label = wrapper.find('label[for="skill-input-Strength"]');
      expect(label.exists()).toBe(true);
      // The icon, name and progress bar form the label, so a large click target natively
      // focuses the input. happy-dom does not implement label->input activation forwarding,
      // so assert the structural contract and let the real-browser check verify it.
      expect(label.text()).toContain('Strength');
      expect(label.classes()).toContain('cursor-pointer');
      expect(label.findAll('div')).toHaveLength(0);
    } finally {
      wrapper.unmount();
      wrapper.element.remove();
    }
  });
  it('keeps the skill row free of role and tabindex attributes', () => {
    const wrapper = createWrapper();
    // The native <label for> supplies the click-to-focus convenience, so the row needs no
    // button role (SonarCloud S6819) and no tab stop of its own.
    const card = wrapper.find('#settings-skill-Strength');
    expect(card.attributes('role')).toBeUndefined();
    expect(card.attributes('tabindex')).toBeUndefined();
    wrapper.unmount();
  });
  it('keeps acronym skill names together', () => {
    const wrapper = createWrapper({
      allGameSkills: computed(() => [makeSkill('DMR'), makeSkill('AimDrills')]),
    });
    expect(wrapper.find('#settings-skill-DMR').text()).toContain('DMR');
    expect(wrapper.find('#settings-skill-DMR').text()).not.toContain('D M R');
    expect(wrapper.find('#settings-skill-AimDrills').text()).toContain('Aim Drills');
  });
  it('shows the level only in the input, with a quest breakdown when quests contribute', () => {
    const wrapper = createWrapper();
    const row = wrapper.find('#settings-skill-Strength');
    expect((findSkillInput(wrapper).element as HTMLInputElement).value).toBe('10');
    expect(row.text()).toContain('settings.skills.from_quests');
    expect(row.text()).toContain('settings.skills.manual_adjustment');
    expect(row.text()).not.toContain('Offset');
  });
  it('omits the breakdown when no quest contributes to the level', () => {
    const wrapper = createWrapper({ getQuestSkillLevel: () => 0 });
    const row = wrapper.find('#settings-skill-Strength');
    expect(row.text()).not.toContain('settings.skills.from_quests');
    expect(row.text()).not.toContain('settings.skills.manual_adjustment');
  });
  it('shows the reset button only for adjusted skills', async () => {
    const resetSkillOffset = vi.fn();
    const offsets: Record<string, number> = { Strength: 3, Endurance: 0 };
    const wrapper = createWrapper({
      allGameSkills: computed(() => [makeSkill('Strength'), makeSkill('Endurance')]),
      getSkillOffset: (key: string) => offsets[key] ?? 0,
      resetSkillOffset,
    });
    expect(wrapper.find('#settings-skill-Strength button').exists()).toBe(true);
    expect(wrapper.find('#settings-skill-Endurance button').exists()).toBe(false);
    await wrapper.find('#settings-skill-Strength button').trigger('click');
    expect(resetSkillOffset).toHaveBeenCalledWith('Strength');
  });
  it('labels the next unmet quest requirement and marks met requirements', () => {
    const levels: Record<string, number> = { Strength: 4, Endurance: 12 };
    const wrapper = createWrapper({
      allGameSkills: computed(() => [
        makeSkill('Strength', { requiredByTasks: ['Task A'], requiredLevels: [5, 10] }),
        makeSkill('Endurance', { requiredByTasks: ['Task B'], requiredLevels: [10] }),
      ]),
      getSkillLevel: (key: string) => levels[key] ?? 0,
    });
    expect(wrapper.find('#settings-skill-Strength .badge').text()).toBe(
      'settings.skills.requirement_needed'
    );
    expect(wrapper.find('#settings-skill-Endurance .badge').text()).toBe(
      'settings.skills.requirement_met'
    );
    expect(findSkillInput(wrapper).attributes('aria-describedby')).toBe(
      'skill-range-Strength skill-requirement-Strength skill-breakdown-Strength'
    );
  });
  it('marks elite skills', () => {
    const wrapper = createWrapper({ getSkillLevel: () => MAX_SKILL_LEVEL });
    expect(wrapper.find('#settings-skill-Strength .badge').text()).toBe('settings.skills.elite');
  });
  it('groups skills by in-game category in in-game order', () => {
    preferencesState.sortMode = 'ingame';
    const wrapper = createWrapper({
      allGameSkills: computed(() => [
        makeSkill('Endurance'),
        makeSkill('Charisma'),
        makeSkill('Pistol'),
        makeSkill('Crafting'),
      ]),
    });
    const headings = wrapper.findAll('h3').map((heading) => heading.text());
    expect(headings).toEqual([
      'settings.skills.categories.physical',
      'settings.skills.categories.mental',
      'settings.skills.categories.combat',
      'settings.skills.categories.practical',
    ]);
  });
  it('shows a flat list without category headings in priority order', () => {
    const wrapper = createWrapper({
      allGameSkills: computed(() => [makeSkill('Endurance'), makeSkill('Pistol')]),
    });
    expect(wrapper.findAll('h3')).toHaveLength(0);
  });
  it('filters to skills needed for quests', async () => {
    const wrapper = createWrapper({
      allGameSkills: computed(() => [
        makeSkill('Strength', { requiredByTasks: ['Task'], requiredLevels: [5] }),
        makeSkill('Endurance'),
      ]),
    });
    await findButton(wrapper, 'settings.skills.filter.needed')!.trigger('click');
    expect(wrapper.find('#settings-skill-Strength').exists()).toBe(true);
    expect(wrapper.find('#settings-skill-Endurance').exists()).toBe(false);
  });
  it('filters by search and offers to clear filters when nothing matches', async () => {
    const wrapper = createWrapper({
      allGameSkills: computed(() => [makeSkill('Strength'), makeSkill('StressResistance')]),
    });
    const search = wrapper.find('#skills-search-input');
    await search.setValue('stress res');
    expect(wrapper.find('#settings-skill-StressResistance').exists()).toBe(true);
    expect(wrapper.find('#settings-skill-Strength').exists()).toBe(false);
    await search.setValue('nothing');
    expect(wrapper.text()).toContain('settings.skills.no_matches');
    await findButton(wrapper, 'settings.skills.clear_filters')!.trigger('click');
    expect(wrapper.find('#settings-skill-Strength').exists()).toBe(true);
  });
  it('resets every adjusted skill after confirmation', async () => {
    const resetSkillOffset = vi.fn();
    const offsets: Record<string, number> = { Strength: 3, Endurance: 2, Health: 0 };
    const wrapper = createWrapper({
      allGameSkills: computed(() => [
        makeSkill('Strength'),
        makeSkill('Endurance'),
        makeSkill('Health'),
      ]),
      getSkillOffset: (key: string) => offsets[key] ?? 0,
      resetSkillOffset,
    });
    expect(wrapper.find('.modal').exists()).toBe(false);
    await findButton(wrapper, 'settings.skills.reset_all')!.trigger('click');
    expect(wrapper.find('.modal').exists()).toBe(true);
    expect(resetSkillOffset).not.toHaveBeenCalled();
    await findButton(wrapper, 'settings.skills.reset_all_confirm')!.trigger('click');
    expect(resetSkillOffset).toHaveBeenCalledTimes(2);
    expect(resetSkillOffset).toHaveBeenCalledWith('Strength');
    expect(resetSkillOffset).toHaveBeenCalledWith('Endurance');
    expect(wrapper.find('.modal').exists()).toBe(false);
  });
  it('keeps the edited row visible under the Adjusted filter until blur', async () => {
    const offsets = ref<Record<string, number>>({ Strength: 3, Endurance: 2 });
    const wrapper = createWrapper({
      allGameSkills: computed(() => [makeSkill('Strength'), makeSkill('Endurance')]),
      getSkillOffset: (key: string) => offsets.value[key] ?? 0,
    });
    await findButton(wrapper, 'settings.skills.filter.adjusted')!.trigger('click');
    const input = findSkillInput(wrapper);
    await input.trigger('focus');
    offsets.value = { Strength: 0, Endurance: 2 };
    await nextTick();
    expect(wrapper.find('#settings-skill-Strength').exists()).toBe(true);
    await input.trigger('blur');
    expect(wrapper.find('#settings-skill-Strength').exists()).toBe(false);
  });
  it('matches search against the raw skill key', async () => {
    const wrapper = createWrapper({
      allGameSkills: computed(() => [makeSkill('AimDrills'), makeSkill('Strength')]),
    });
    await wrapper.find('#skills-search-input').setValue('aimdrills');
    expect(wrapper.find('#settings-skill-AimDrills').exists()).toBe(true);
    expect(wrapper.find('#settings-skill-Strength').exists()).toBe(false);
  });
  it('clamps pasted levels to the valid range', async () => {
    const setTotalSkillLevel = vi.fn(() => true);
    const wrapper = createWrapper({ setTotalSkillLevel });
    await findSkillInput(wrapper).trigger('paste', { clipboardData: { getData: () => ' 75 ' } });
    expect(setTotalSkillLevel).toHaveBeenCalledWith('Strength', MAX_SKILL_LEVEL);
  });
  it('returns to All once the last adjusted skill is reset', async () => {
    const offsets = ref<Record<string, number>>({ Strength: 3 });
    const wrapper = createWrapper({
      allGameSkills: computed(() => [makeSkill('Strength'), makeSkill('Endurance')]),
      getSkillOffset: (key: string) => offsets.value[key] ?? 0,
    });
    await findButton(wrapper, 'settings.skills.filter.adjusted')!.trigger('click');
    expect(wrapper.find('#settings-skill-Endurance').exists()).toBe(false);
    offsets.value = {};
    await nextTick();
    await nextTick();
    expect(wrapper.find('#settings-skill-Endurance').exists()).toBe(true);
  });
  it('reveals and highlights a deep-linked skill hidden by the current search', async () => {
    const allGameSkills = ref<GameSkill[]>([]);
    const strength = makeSkill('Strength');
    const wrapper = createWrapper({
      allGameSkills: computed(() => allGameSkills.value),
      getSkillMetadata: (key: string) => (key === 'Strength' ? strength : null),
    });
    document.body.appendChild(wrapper.element);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      allGameSkills.value = [strength, makeSkill('Endurance')];
      await nextTick();
      await wrapper.find('#skills-search-input').setValue('endurance');
      expect(wrapper.find('#settings-skill-Strength').exists()).toBe(false);
      const router = useRouter();
      await router.push({ path: router.currentRoute.value.path, query: { skill: 'Strength' } });
      allGameSkills.value = [strength, makeSkill('Endurance'), makeSkill('Health')];
      await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
      expect(wrapper.find('#settings-skill-Strength').classes()).toContain('ring-2');
      await vi.waitFor(() => expect(router.currentRoute.value.query.skill).toBeUndefined());
    } finally {
      wrapper.unmount();
      wrapper.element.remove();
    }
  });
  it('waits for the pointer release before dropping a pinned row', async () => {
    const offsets = ref<Record<string, number>>({ Strength: 3, Endurance: 2 });
    const wrapper = createWrapper({
      allGameSkills: computed(() => [makeSkill('Strength'), makeSkill('Endurance')]),
      getSkillOffset: (key: string) => offsets.value[key] ?? 0,
    });
    await findButton(wrapper, 'settings.skills.filter.adjusted')!.trigger('click');
    const input = findSkillInput(wrapper);
    await input.trigger('focus');
    offsets.value = { Strength: 0, Endurance: 2 };
    window.dispatchEvent(new Event('pointerdown'));
    await input.trigger('blur');
    expect(wrapper.find('#settings-skill-Strength').exists()).toBe(true);
    window.dispatchEvent(new Event('pointerup'));
    await vi.waitFor(() => expect(wrapper.find('#settings-skill-Strength').exists()).toBe(false));
  });
  it('moves focus to the level input after resetting a row', async () => {
    const wrapper = createWrapper();
    document.body.appendChild(wrapper.element);
    try {
      await wrapper.find('#settings-skill-Strength button').trigger('click');
      await nextTick();
      expect(document.activeElement?.id).toBe('skill-input-Strength');
    } finally {
      wrapper.unmount();
      wrapper.element.remove();
    }
  });
  it('hides the reset-all action when nothing is adjusted', () => {
    const wrapper = createWrapper({ getSkillOffset: () => 0 });
    expect(findButton(wrapper, 'settings.skills.reset_all')).toBeUndefined();
  });
});
