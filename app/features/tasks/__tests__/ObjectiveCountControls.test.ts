import { mount } from '@vue/test-utils';
import { TooltipProvider } from 'reka-ui';
import { describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import ObjectiveCountControls from '@/features/tasks/ObjectiveCountControls.vue';
vi.mock('vue-i18n', () => {
  return {
    useI18n: () => ({
      t: (key: string, ...args: unknown[]) => {
        const lastArg = args[args.length - 1];
        return typeof lastArg === 'string' ? lastArg : key;
      },
    }),
  };
});
/**
 * Mounts ObjectiveCountControls wrapped in a TooltipProvider for testing.
 * @param props - The props to pass to ObjectiveCountControls (currentCount and neededCount)
 * @returns A Vue Test Utils wrapper for the mounted component
 */
function mountWithProvider(props: {
  currentCount: number;
  neededCount: number;
}): ReturnType<typeof mount> {
  return mount(TooltipProvider, {
    slots: {
      default: () => h(ObjectiveCountControls, props),
    },
  });
}
describe('ObjectiveCountControls', () => {
  it('disables decrease at zero', () => {
    const wrapper = mountWithProvider({ currentCount: 0, neededCount: 3 });
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(3);
    expect((buttons[0]!.element as HTMLButtonElement).disabled).toBe(true);
    expect((buttons[1]!.element as HTMLButtonElement).disabled).toBe(false);
    expect(buttons[2]!.attributes('aria-pressed')).toBe('false');
    expect(buttons[0]!.attributes('aria-label')).toBeTruthy();
    expect(buttons[1]!.attributes('aria-label')).toBeTruthy();
  });
  it('disables increase at needed count', () => {
    const wrapper = mountWithProvider({ currentCount: 3, neededCount: 3 });
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(3);
    expect((buttons[0]!.element as HTMLButtonElement).disabled).toBe(false);
    expect((buttons[1]!.element as HTMLButtonElement).disabled).toBe(true);
    expect(buttons[2]!.attributes('aria-pressed')).toBe('true');
  });
  it('emits actions when clicked', async () => {
    const wrapper = mountWithProvider({ currentCount: 1, neededCount: 3 });
    const component = wrapper.findComponent(ObjectiveCountControls);
    const buttons = wrapper.findAll('button');
    await buttons[0]!.trigger('click');
    await buttons[1]!.trigger('click');
    await buttons[2]!.trigger('click');
    expect(component.emitted('decrease')).toHaveLength(1);
    expect(component.emitted('increase')).toHaveLength(1);
    expect(component.emitted('toggle')).toHaveLength(1);
  });
});
