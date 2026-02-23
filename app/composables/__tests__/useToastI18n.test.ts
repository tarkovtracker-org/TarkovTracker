import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastI18n } from '@/composables/useToastI18n';
const add = vi.fn();
vi.mock('@/composables/useSafeToast', () => ({
  useSafeToast: () => ({ add }),
}));
vi.mock('@/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}));
const t = (key: string, params?: Record<string, unknown>) => {
  if (!params) return key;
  const formattedParams = Object.entries(params)
    .map(([paramKey, value]) => `${paramKey}=${String(value)}`)
    .join(',');
  return `${key}:${formattedParams}`;
};
describe('useToastI18n', () => {
  beforeEach(() => {
    add.mockReset();
  });
  it('shows local ignored toast for the requested reason', () => {
    const toastI18n = useToastI18n(t);
    toastI18n.showLocalIgnored('guest');
    expect(add).toHaveBeenCalledWith({
      color: 'warning',
      description: 'toast.local_ignored.guest',
      title: 'toast.local_ignored.title',
    });
  });
  it('shows progress merged toast with count params', () => {
    const toastI18n = useToastI18n(t);
    toastI18n.showProgressMerged(5);
    expect(add).toHaveBeenCalledWith({
      color: 'warning',
      description: 'toast.progress_merged.description:count=5',
      duration: 5000,
      title: 'toast.progress_merged.title',
    });
  });
  it('shows api updated toast with localized title', () => {
    const toastI18n = useToastI18n(t);
    toastI18n.showApiUpdated('Tasks updated: Setup -> completed.');
    expect(add).toHaveBeenCalledWith({
      color: 'primary',
      description: 'Tasks updated: Setup -> completed.',
      duration: 6000,
      title: 'toast.api_updated.title',
    });
  });
});
