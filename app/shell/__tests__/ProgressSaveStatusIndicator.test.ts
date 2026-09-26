// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  recordLocalSave,
  registerCloudRetryHandler,
  resetCloudSaveStatus,
  setCloudSaveStatus,
  type CloudSaveStatus,
} from '@/stores/tarkov/progressSaveStatus';
const { exportProgress, toastAdd } = vi.hoisted(() => ({
  exportProgress: vi.fn(),
  toastAdd: vi.fn(),
}));
vi.mock('@/composables/useDataBackup', () => ({
  useDataBackup: () => ({ exportProgress }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
mockNuxtImport('useToast', () => () => ({ add: toastAdd }));
const cloud = (state: CloudSaveStatus['state'], extra: Partial<CloudSaveStatus> = {}) =>
  setCloudSaveStatus({ state, failure: null, retryAttempt: 0, nextRetryAt: null, ...extra });
const mountIndicator = async () => {
  const { default: Indicator } = await import('@/shell/ProgressSaveStatusIndicator.vue');
  return mount(Indicator, {
    global: {
      stubs: {
        AppTooltip: { template: '<span><slot /></span>' },
        UPopover: { template: '<div><slot /><slot name="content" /></div>' },
        UButton: {
          props: ['icon', 'disabled'],
          emits: ['click'],
          template:
            '<button v-bind="$attrs" :data-icon="icon" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  });
};
describe('ProgressSaveStatusIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCloudSaveStatus();
    recordLocalSave(true);
  });
  it('stays hidden while nothing is pending', async () => {
    const wrapper = await mountIndicator();
    expect(wrapper.find('[data-testid="progress-save-status"]').exists()).toBe(false);
  });
  it('marks pending cloud changes and confirms only the verified local copy', async () => {
    cloud('pending');
    const wrapper = await mountIndicator();
    const trigger = wrapper.get('[data-testid="progress-save-status"]');
    expect(trigger.attributes('data-status')).toBe('cloud_pending');
    expect(wrapper.text()).toContain('progress_save_status.local_saved_note');
    expect(wrapper.find('[data-testid="progress-save-export"]').exists()).toBe(false);
  });
  it('explains an exhausted cloud save with its cause and offers retry and export', async () => {
    cloud('failed', { failure: 'offline', retryAttempt: 3 });
    const wrapper = await mountIndicator();
    expect(wrapper.get('[data-testid="progress-save-status"]').attributes('data-status')).toBe(
      'cloud_failed'
    );
    expect(wrapper.text()).toContain('progress_save_status.cloud_failed_description');
    expect(wrapper.text()).toContain('progress_save_status.cause_offline');
    expect(wrapper.find('[data-testid="progress-save-retry"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="progress-save-export"]').exists()).toBe(true);
  });
  it('shows the scheduled automatic attempt while retrying', async () => {
    cloud('retry_scheduled', { failure: 'unknown', retryAttempt: 2 });
    const wrapper = await mountIndicator();
    expect(wrapper.text()).toContain('"attempt":2');
    expect(wrapper.text()).toContain('progress_save_status.cause_unknown');
  });
  it('warns about memory-only changes and never calls them locally saved', async () => {
    cloud('failed', { failure: 'offline' });
    recordLocalSave(false, 'quota');
    const wrapper = await mountIndicator();
    expect(wrapper.get('[data-testid="progress-save-status"]').attributes('data-status')).toBe(
      'local_failed'
    );
    expect(wrapper.text()).not.toContain('progress_save_status.local_saved_note');
    expect(wrapper.text()).toContain('progress_save_status.cloud_also_pending_note');
    expect(wrapper.text()).toContain('progress_save_status.cause_quota');
    expect(wrapper.text()).toContain('progress_save_status.quota_guidance');
  });
  it('warns signed-out players when the browser cannot save', async () => {
    recordLocalSave(false, 'unavailable');
    const wrapper = await mountIndicator();
    expect(wrapper.text()).toContain('progress_save_status.local_failed_description');
    expect(wrapper.find('[data-testid="progress-save-retry"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="progress-save-export"]').exists()).toBe(true);
  });
  it('runs a manual retry and reports the outcome without implying success', async () => {
    cloud('failed', { failure: 'unknown' });
    const handler = vi.fn().mockResolvedValue(false);
    registerCloudRetryHandler(handler);
    const wrapper = await mountIndicator();
    await wrapper.get('[data-testid="progress-save-retry"]').trigger('click');
    await flushPromises();
    expect(handler).toHaveBeenCalledOnce();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'progress_save_status.retry_failed' })
    );
  });
  it('exports current progress and reports export failures', async () => {
    recordLocalSave(false, 'quota');
    exportProgress.mockRejectedValueOnce(new Error('blocked'));
    const wrapper = await mountIndicator();
    await wrapper.get('[data-testid="progress-save-export"]').trigger('click');
    await flushPromises();
    expect(exportProgress).toHaveBeenCalledOnce();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'settings.data_management.export_error_title' })
    );
  });
});
