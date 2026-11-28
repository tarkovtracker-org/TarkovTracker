import { flushPromises, shallowMount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import EftLogDropzone from '@/features/settings/EftLogDropzone.vue';
describe('EftLogDropzone', () => {
  it('reports unreadable entries and clears the error on retry', async () => {
    const wrapper = shallowMount(EftLogDropzone, {
      global: { mocks: { $t: (key: string) => key }, stubs: { UButton: true } },
    });
    const entry = {
      isFile: true,
      file: (_resolve: (result: File) => void, reject: (error: Error) => void) => {
        reject(new Error('unreadable file'));
      },
    };
    await wrapper.trigger('drop', { dataTransfer: { items: [{ webkitGetAsEntry: () => entry }] } });
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'settings.log_import.errors.drop_read_failed'
    );
    const file = new File(['log'], 'event.log');
    await wrapper.trigger('drop', { dataTransfer: { files: [file] } });
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.emitted('selectFiles')).toEqual([[[file]]]);
    wrapper.unmount();
  });
  it.each(['enabled', 'disabled'])(
    'finishes a delayed folder drop when still %s',
    async (state) => {
      const wrapper = shallowMount(EftLogDropzone, {
        global: { mocks: { $t: (key: string) => key }, stubs: { UButton: true } },
      });
      const file = new File(['log'], 'event.log');
      const read = Promise.withResolvers<File>();
      const entry = {
        isFile: true,
        file: (resolve: (result: File) => void) => read.promise.then(resolve),
      };
      await wrapper.trigger('drop', {
        dataTransfer: { items: [{ webkitGetAsEntry: () => entry }] },
      });
      if (state === 'disabled') await wrapper.setProps({ disabled: true });
      read.resolve(file);
      await flushPromises();
      expect(wrapper.emitted('selectFiles')).toEqual(state === 'enabled' ? [[[file]]] : undefined);
      wrapper.unmount();
    }
  );
});
