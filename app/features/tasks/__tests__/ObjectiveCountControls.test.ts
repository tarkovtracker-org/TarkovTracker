import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import ObjectiveCountControls from '@/features/tasks/ObjectiveCountControls.vue';
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, ...args: unknown[]) => {
      const lastArg = args[args.length - 1];
      return typeof lastArg === 'string' ? lastArg : key;
    },
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
function mountComponent(props: {
  currentCount: number;
  neededCount: number;
}): ReturnType<typeof mount> {
  return mount(ObjectiveCountControls, {
    props,
    global: {
      stubs: {
        AppTooltip: AppTooltipStub,
        UIcon: UIconStub,
      },
    },
  });
}
describe('ObjectiveCountControls', () => {
  it('disables decrease at zero', () => {
    const wrapper = mountComponent({ currentCount: 0, neededCount: 3 });
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(3);
    expect((buttons[0]!.element as HTMLButtonElement).disabled).toBe(true);
    expect((buttons[1]!.element as HTMLButtonElement).disabled).toBe(false);
    expect(buttons[2]!.attributes('aria-pressed')).toBe('false');
    expect(buttons[0]!.attributes('aria-label')).toBeTruthy();
    expect(buttons[1]!.attributes('aria-label')).toBeTruthy();
  });
  it('disables increase at needed count', () => {
    const wrapper = mountComponent({ currentCount: 3, neededCount: 3 });
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(3);
    expect((buttons[0]!.element as HTMLButtonElement).disabled).toBe(false);
    expect((buttons[1]!.element as HTMLButtonElement).disabled).toBe(true);
    expect(buttons[2]!.attributes('aria-pressed')).toBe('true');
  });
  it('emits actions when clicked', async () => {
    const wrapper = mountComponent({ currentCount: 1, neededCount: 3 });
    const buttons = wrapper.findAll('button');
    await buttons[0]!.trigger('click');
    await buttons[1]!.trigger('click');
    await buttons[2]!.trigger('click');
    expect(wrapper.emitted('decrease')).toHaveLength(1);
    expect(wrapper.emitted('increase')).toHaveLength(1);
    expect(wrapper.emitted('toggle')).toHaveLength(1);
  });
});
