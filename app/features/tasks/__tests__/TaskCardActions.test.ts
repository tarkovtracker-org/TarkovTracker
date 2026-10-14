import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import TaskCardActions from '@/features/tasks/TaskCardActions.vue';
import type { ActionButtonState } from '@/features/tasks/types';
const ButtonStub = {
  inheritAttrs: false,
  props: ['color', 'disabled', 'size', 'variant'],
  emits: ['click'],
  template:
    '<button v-bind="$attrs" :data-color="color" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
};
const mountActions = (state: ActionButtonState, isFailed = false) =>
  mountSuspended(TaskCardActions, {
    props: { state, size: 'sm', isFailed },
    global: { stubs: { UButton: ButtonStub } },
  });
describe('TaskCardActions', () => {
  it('accepts available tasks and completes active tasks', async () => {
    const available = await mountActions('available');
    const acceptButton = available.get('button');
    expect(acceptButton.text()).toBe('Accept');
    expect(acceptButton.attributes('data-color')).toBe('primary');
    await acceptButton.trigger('click');
    expect(available.emitted('active')).toEqual([[]]);
    const active = await mountActions('active');
    const completeButton = active.get('button');
    expect(completeButton.text()).toBe('Complete');
    expect(completeButton.attributes('data-color')).toBe('success');
    await completeButton.trigger('click');
    expect(active.emitted('complete')).toEqual([[]]);
  });
  it('offers undo and reset-failed actions for completed states', async () => {
    const complete = await mountActions('complete');
    const undoButton = complete.get('button');
    expect(undoButton.text()).toBe('Mark Uncompleted');
    await undoButton.trigger('click');
    expect(complete.emitted('uncomplete')).toEqual([[]]);
    const failed = await mountActions('complete', true);
    expect(failed.get('button').text()).toBe('Reset Failed');
    await failed.get('button').trigger('click');
    expect(failed.emitted('uncomplete')).toEqual([[]]);
  });
  it('shows the locked available action and the alternate complete/fail controls', async () => {
    const locked = await mountActions('locked');
    expect(locked.get('button').text()).toBe('Mark Available');
    await locked.get('button').trigger('click');
    expect(locked.emitted('available')).toEqual([[]]);
    const hotwheels = await mountActions('hotwheels');
    const buttons = hotwheels.findAll('button');
    expect(buttons.map((button) => button.text())).toEqual(['Complete', 'Fail']);
    await buttons[0]!.trigger('click');
    await buttons[1]!.trigger('click');
    expect(hotwheels.emitted('complete')).toEqual([[]]);
    expect(hotwheels.emitted('failed')).toEqual([[]]);
  });
  it('renders no actions for a hidden action state', async () => {
    const wrapper = await mountActions('none');
    expect(wrapper.find('button').exists()).toBe(false);
  });
  it('does not run a stale action after the state becomes hidden', async () => {
    const wrapper = await mountActions('available');
    const staleButton = wrapper.get('button');
    await wrapper.setProps({ state: 'none' });
    expect(wrapper.find('button').exists()).toBe(false);
    await staleButton.trigger('click');
    expect(wrapper.emitted('active')).toBeUndefined();
  });
  it('keeps malformed runtime states unlabeled and actionless', async () => {
    const wrapper = await mountActions('malformed' as ActionButtonState);
    const button = wrapper.get('button');
    expect(button.text()).toBe('');
    await button.trigger('click');
    expect(wrapper.emitted()).toEqual({});
  });
});
