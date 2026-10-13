import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TaskTraderFilter from '@/features/tasks/TaskTraderFilter.vue';
vi.mock('vue-i18n', async () => ({
  ...(await vi.importActual<typeof import('vue-i18n')>('vue-i18n')),
  useI18n: () => ({ t: (key: string) => key }),
}));
const SelectMenuFixedStub = {
  name: 'SelectMenuFixed',
  props: ['modelValue', 'items'],
  emits: ['update:modelValue'],
  template:
    '<div><slot /><div v-for="item in items" :key="item.value" data-testid="item"><slot name="item" :item="item" /></div></div>',
};
const traders = [
  { id: 'prapor', name: 'Prapor', imageLink: 'https://assets.tarkov.dev/prapor.webp' },
  { id: 'therapist', name: 'Therapist' },
];
const mountFilter = (props: Record<string, unknown> = {}) =>
  mount(TaskTraderFilter, {
    props: { modelValue: 'all', traders, counts: { prapor: 3 }, allowAny: true, ...props },
    global: { stubs: { SelectMenuFixed: SelectMenuFixedStub, UIcon: true } },
  });
describe('TaskTraderFilter', () => {
  it('lists an any option before each trader with its count', () => {
    const wrapper = mountFilter();
    const items = wrapper.findAll('[data-testid="item"]').map((item) => item.text());
    expect(items).toEqual(['page.tasks.filters.all_traders', 'Prapor3', 'Therapist0']);
  });
  it('drops the any option when one trader is required', () => {
    const wrapper = mountFilter({ modelValue: 'prapor', allowAny: false });
    const items = wrapper.findAll('[data-testid="item"]').map((item) => item.text());
    expect(items).toEqual(['Prapor3', 'Therapist0']);
  });
  it('shows the selected trader in the trigger', () => {
    const wrapper = mountFilter({ modelValue: 'prapor' });
    const trigger = wrapper.findComponent({ name: 'SelectMenuFixed' }).element.firstElementChild;
    expect(trigger?.textContent).toContain('Prapor');
    expect(trigger?.querySelector('img')?.getAttribute('src')).toBe(traders[0]!.imageLink);
  });
  it('emits only real changes', () => {
    const wrapper = mountFilter({ modelValue: 'prapor' });
    const menu = wrapper.findComponent({ name: 'SelectMenuFixed' });
    menu.vm.$emit('update:modelValue', 'prapor');
    menu.vm.$emit('update:modelValue', undefined);
    menu.vm.$emit('update:modelValue', 'therapist');
    expect(wrapper.emitted('update:modelValue')).toEqual([['therapist']]);
  });
});
