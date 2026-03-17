import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnalyticsEvents } from '@/composables/useAnalyticsEvents';
describe('useAnalyticsEvents', () => {
  beforeEach(() => {
    delete window.gtag;
    delete window.clarity;
    delete window.__ttGoogleAnalyticsReady;
    delete window.__ttMicrosoftClarityReady;
  });
  it('does not emit events before any analytics destination is ready', () => {
    const { trackEvent } = useAnalyticsEvents();
    trackEvent('task_complete', { task_id: 'task-1' });
    expect(window.gtag).toBeUndefined();
    expect(window.clarity).toBeUndefined();
  });
  it('emits to queueing stubs before readiness flags flip', () => {
    window.gtag = vi.fn() as NonNullable<Window['gtag']>;
    const { trackEvent } = useAnalyticsEvents();
    trackEvent('login_start', { method: 'discord' });
    expect(window.gtag).toHaveBeenCalledWith('event', 'login_start', {
      method: 'discord',
    });
  });
  it('does not emit to existing stubs after consent explicitly disables both providers', () => {
    window.gtag = vi.fn() as NonNullable<Window['gtag']>;
    window.clarity = vi.fn() as unknown as NonNullable<Window['clarity']>;
    window.__ttGoogleAnalyticsReady = false;
    window.__ttMicrosoftClarityReady = false;
    const { trackEvent } = useAnalyticsEvents();
    trackEvent('task_complete', { task_id: 'task-1' });
    expect(window.gtag).not.toHaveBeenCalled();
    expect(window.clarity).not.toHaveBeenCalled();
  });
  it('emits only to Google Analytics when only GA is ready', () => {
    window.gtag = vi.fn() as NonNullable<Window['gtag']>;
    window.__ttGoogleAnalyticsReady = true;
    const { trackEvent } = useAnalyticsEvents();
    trackEvent('task_complete', { task_id: 'task-1', skipped: undefined });
    expect(window.gtag).toHaveBeenCalledWith('event', 'task_complete', {
      task_id: 'task-1',
    });
    expect(window.clarity).toBeUndefined();
  });
  it('emits to both providers when both are ready', () => {
    window.gtag = vi.fn() as NonNullable<Window['gtag']>;
    window.clarity = vi.fn() as unknown as NonNullable<Window['clarity']>;
    window.__ttGoogleAnalyticsReady = true;
    window.__ttMicrosoftClarityReady = true;
    const { trackEvent } = useAnalyticsEvents();
    trackEvent('task_complete', { task_id: 'task-1' });
    expect(window.gtag).toHaveBeenCalledWith('event', 'task_complete', {
      task_id: 'task-1',
    });
    expect(window.clarity).toHaveBeenCalledWith('event', 'task_complete');
  });
});
