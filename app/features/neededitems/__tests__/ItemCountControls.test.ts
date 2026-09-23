import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';
import ItemCountControls from '@/features/neededitems/ItemCountControls.vue';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    locale: ref('en'),
    t: (key: string) => key,
  }),
}));
const AppTooltipStub = defineComponent({
  props: ['text'],
  template: '<span><slot /></span>',
});
const UIconStub = defineComponent({
  props: ['name'],
  template: '<span class="icon-stub" />',
});
type Wrapper = ReturnType<typeof mount>;
const mounted: Wrapper[] = [];
function mountComponent(props: { currentCount: number; neededCount: number }): Wrapper {
  const wrapper = mount(ItemCountControls, {
    props,
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        AppTooltip: AppTooltipStub,
        UIcon: UIconStub,
      },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}
async function startEditing(wrapper: Wrapper) {
  await wrapper.get('button[aria-label="needed_items.aria.click_to_enter_value"]').trigger('click');
  await nextTick();
  return wrapper.get('input[type="number"]');
}
async function editAndCommit(
  wrapper: Wrapper,
  value: string,
  commit: 'enter' | 'blur' = 'enter'
): Promise<void> {
  const input = await startEditing(wrapper);
  await input.setValue(value);
  if (commit === 'enter') {
    await input.trigger('keydown', { key: 'Enter' });
  } else {
    await input.trigger('blur');
  }
}
function emittedCounts(wrapper: Wrapper): number[] {
  return (wrapper.emitted('setCount') ?? []).map((args) => args[0] as number);
}
describe('ItemCountControls inline edit', () => {
  afterEach(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
  it('focuses and selects the input when editing starts', async () => {
    const wrapper = mountComponent({ currentCount: 3, neededCount: 10 });
    const input = await startEditing(wrapper);
    expect(document.activeElement).toBe(input.element);
    expect((input.element as HTMLInputElement).value).toBe('3');
  });
  it.each([
    { description: 'decimal input', currentCount: 0, value: '2.5', expected: 2 },
    { description: 'negative input', currentCount: 4, value: '-3', expected: 0 },
    { description: 'negative fractional input', currentCount: 4, value: '-0.5', expected: 0 },
    { description: 'input above neededCount', currentCount: 4, value: '25', expected: 10 },
    { description: 'zero', currentCount: 4, value: '0', expected: 0 },
    { description: 'maximum allowed value', currentCount: 4, value: '10', expected: 10 },
    { description: 'fractional value below maximum', currentCount: 4, value: '9.9', expected: 9 },
    { description: 'empty input', currentCount: 4, value: '', expected: 0 },
  ])('normalizes $description to $expected', async ({ currentCount, value, expected }) => {
    const wrapper = mountComponent({ currentCount, neededCount: 10 });
    await editAndCommit(wrapper, value);
    expect(emittedCounts(wrapper)).toEqual([expected]);
    expect(Number.isInteger(emittedCounts(wrapper)[0])).toBe(true);
  });
  it('commits on Enter and leaves edit mode', async () => {
    const wrapper = mountComponent({ currentCount: 1, neededCount: 10 });
    await editAndCommit(wrapper, '7', 'enter');
    expect(emittedCounts(wrapper)).toEqual([7]);
    expect(wrapper.find('input').exists()).toBe(false);
  });
  it('commits on blur and leaves edit mode', async () => {
    const wrapper = mountComponent({ currentCount: 1, neededCount: 10 });
    await editAndCommit(wrapper, '6.75', 'blur');
    expect(emittedCounts(wrapper)).toEqual([6]);
    expect(wrapper.find('input').exists()).toBe(false);
  });
  it('emits once when Enter is followed by blur', async () => {
    const wrapper = mountComponent({ currentCount: 1, neededCount: 10 });
    const input = await startEditing(wrapper);
    await input.setValue('5');
    await input.trigger('keydown', { key: 'Enter' });
    await input.trigger('blur');
    expect(emittedCounts(wrapper)).toEqual([5]);
  });
  it('still emits setCount when the committed value equals the current count', async () => {
    const wrapper = mountComponent({ currentCount: 3, neededCount: 10 });
    await editAndCommit(wrapper, '3');
    expect(emittedCounts(wrapper)).toEqual([3]);
  });
  it('cancels on Escape without emitting', async () => {
    const wrapper = mountComponent({ currentCount: 2, neededCount: 10 });
    const input = await startEditing(wrapper);
    await input.setValue('8');
    await input.trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('setCount')).toBeUndefined();
    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.text()).toContain('2/10');
  });
  it('cancels editing without emitting when currentCount changes externally', async () => {
    const wrapper = mountComponent({ currentCount: 2, neededCount: 10 });
    const input = await startEditing(wrapper);
    await input.setValue('8');
    await wrapper.setProps({ currentCount: 5 });
    await nextTick();
    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.emitted('setCount')).toBeUndefined();
    expect(wrapper.text()).toContain('5/10');
  });
  it('keeps the input bounded by min/max attributes', async () => {
    const wrapper = mountComponent({ currentCount: 2, neededCount: 10 });
    const input = await startEditing(wrapper);
    expect(input.attributes('min')).toBe('0');
    expect(input.attributes('max')).toBe('10');
  });
  it('keeps decrease, increase, and toggle event contracts', async () => {
    const wrapper = mountComponent({ currentCount: 2, neededCount: 10 });
    await wrapper.get('button[aria-label="needed_items.aria.decrease_count"]').trigger('click');
    await wrapper.get('button[aria-label="needed_items.aria.increase_count"]').trigger('click');
    await wrapper.get('button[aria-label="needed_items.aria.mark_as_complete"]').trigger('click');
    expect(wrapper.emitted('decrease')).toEqual([[]]);
    expect(wrapper.emitted('increase')).toEqual([[]]);
    expect(wrapper.emitted('toggle')).toEqual([[]]);
  });
});
