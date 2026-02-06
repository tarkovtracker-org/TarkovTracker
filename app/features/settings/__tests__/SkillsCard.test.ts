import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { useSkillCalculation } from '@/composables/useSkillCalculation';
import SkillsCard from '@/features/settings/SkillsCard.vue';
import { MAX_SKILL_LEVEL } from '@/utils/constants';
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    en: {},
    de: {},
    es: {},
    fr: {},
    ru: {},
    uk: {},
    zh: {},
  },
});
vi.mock('@/composables/useSkillCalculation');
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({
    getSkillSortMode: 'priority',
    setSkillSortMode: vi.fn(),
  }),
}));
vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>();
  return {
    ...actual,
    useBreakpoints: () => ({
      greaterOrEqual: () => ref(true),
    }),
    breakpointsTailwind: {},
  };
});
mockNuxtImport('useToast', () => () => ({
  add: vi.fn(),
}));
const _GenericCard = { template: '<div><slot name="content" /></div>' };
const UInput = {
  template:
    '<input type="text" :value="modelValue" @keydown="$emit(\'keydown\', $event)" @input="$emit(\'update:model-value\', $event.target.value)" />',
  props: ['modelValue'],
};
const _UButton = { template: '<button />' };
const _UIcon = { template: '<div />' };
const _UTooltip = { template: '<div><slot /></div>' };
const _UBadge = { template: '<div />' };
type UseSkillCalculationMock = ReturnType<typeof useSkillCalculation>;
const createWrapper = (overrides: Partial<UseSkillCalculationMock> = {}) => {
  const defaultMock: UseSkillCalculationMock = {
    calculatedQuestSkills: computed(() => ({})),
    totalSkills: computed(() => ({})),
    allSkillNames: computed(() => []),
    allGameSkills: computed(() => [
      {
        name: 'Strength',
        requiredByTasks: [],
        requiredLevels: [],
        rewardedByTasks: [],
      },
    ]),
    getSkillLevel: () => 10,
    getQuestSkillLevel: () => 5,
    getSkillOffset: () => 5,
    getSkillMetadata: () => null,
    setSkillOffset: vi.fn(),
    setTotalSkillLevel: vi.fn(() => true),
    resetSkillOffset: vi.fn(),
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
        ULink: true,
        NuxtLink: true,
        Icon: true,
      },
      mocks: {
        $t: (key: string, fallback: string) => fallback,
      },
    },
  });
};
describe('SkillsCard', () => {
  it('prevents invalid characters on keydown', async () => {
    const setTotalSkillLevel = vi.fn(() => true);
    const wrapper = createWrapper({ setTotalSkillLevel });
    const input = wrapper.find('input');
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
    const input = wrapper.find('input');
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
    const input = wrapper.find('input');
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
});
