// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultOwnedProgressData } from '@/utils/progressSanitizers';
const { config } = vi.hoisted(() => ({
  config: {
    progressDiagnosticSinkUrl: '/api/logs/client',
    clientLogSinkUrl: '',
    buildCommit: 'a'.repeat(40),
  },
}));
mockNuxtImport('tryUseNuxtApp', () => () => ({ $config: { public: config } }));
describe('aggregate progress payload diagnostics', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    config.progressDiagnosticSinkUrl = '/api/logs/client';
    config.clientLogSinkUrl = '';
  });
  it('reports only fixed aggregate fields, measures UTF-8, and omits identities and location', async () => {
    const { reportProgressPayload } = await import('@/utils/progressPayloadDiagnostics');
    const progress = createDefaultOwnedProgressData();
    progress.displayName = 'private-profile';
    progress.taskObjectives['private-objective'] = { complete: true };
    progress.manualActivityHistory = [
      {
        id: 'private-history',
        timestamp: 1,
        type: 'task',
        action: 'complete',
        title: '😀'.repeat(70000),
      },
    ];
    const modes = { pvp: progress };
    reportProgressPayload(modes, modes, null);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, request] = vi.mocked(fetch).mock.calls[0]!;
    expect(request).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
    const body = JSON.parse(request!.body as string);
    expect(body.href).toBeNull();
    expect(body.args[1]).toMatchObject({
      buildCommit: 'a'.repeat(40),
      requestWireBytes: new TextEncoder().encode(JSON.stringify(modes)).length,
      outcome: 'accepted',
      modes: { pvp: { counts: { taskObjectives: 1, manualActivityHistory: 1 } } },
    });
    expect(request!.body).not.toMatch(/private-|userId|tarkovUid|displayName/);
    reportProgressPayload(modes, modes, null);
    expect(fetch).toHaveBeenCalledTimes(1);
    reportProgressPayload(modes, modes, { message: 'p_modes exceeds the maximum payload size' });
    expect(fetch).toHaveBeenCalledTimes(2);
    reportProgressPayload(modes, modes, { message: 'p_modes exceeds the maximum payload size' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('caps telemetry across a long sequence of different rejected saves', async () => {
    const { reportProgressPayload } = await import('@/utils/progressPayloadDiagnostics');
    const now = vi.spyOn(Date, 'now');
    const modes = { pvp: createDefaultOwnedProgressData() };
    for (let i = 0; i < 35; i++) {
      now.mockReturnValue(200000 + i * 12000);
      modes.pvp.level = i + 1;
      reportProgressPayload(modes, modes, { message: 'p_modes exceeds the maximum payload size' });
    }
    expect(fetch).toHaveBeenCalledTimes(30);
  });
  it('reserves rejection samples after accepted saves exhaust their own budget', async () => {
    const { reportProgressPayload } = await import('@/utils/progressPayloadDiagnostics');
    const now = vi.spyOn(Date, 'now');
    const modes = { pvp: createDefaultOwnedProgressData() };
    modes.pvp.displayName = 'x'.repeat(300000);
    for (let i = 0; i < 30; i++) {
      now.mockReturnValue(200000 + i * 12000);
      reportProgressPayload(modes, modes, null);
    }
    expect(fetch).toHaveBeenCalledTimes(30);
    reportProgressPayload(modes, modes, { message: 'p_modes exceeds the maximum payload size' });
    expect(fetch).toHaveBeenCalledTimes(31);
  });
  it('does not serialize disabled diagnostics and labels superseded work separately', async () => {
    const { reportProgressPayload } = await import('@/utils/progressPayloadDiagnostics');
    const modes = { pvp: createDefaultOwnedProgressData() };
    config.progressDiagnosticSinkUrl = '';
    Object.defineProperty(modes.pvp, 'displayName', {
      configurable: true,
      get() {
        throw new Error('disabled diagnostics must not inspect profile data');
      },
    });
    expect(() => reportProgressPayload(modes, modes, null)).not.toThrow();
    Object.defineProperty(modes.pvp, 'displayName', { value: 'x'.repeat(300000) });
    config.progressDiagnosticSinkUrl = '/api/logs/client';
    reportProgressPayload(modes, modes, { message: 'Progress sync superseded by newer state' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]![1]!.body).toContain('superseded');
  });
  it('keeps aggregate collection independent of general browser logs', async () => {
    const { reportProgressPayload } = await import('@/utils/progressPayloadDiagnostics');
    const modes = { pvp: createDefaultOwnedProgressData() };
    reportProgressPayload(modes, modes, null);
    config.progressDiagnosticSinkUrl = '';
    config.clientLogSinkUrl = '/api/logs/client';
    reportProgressPayload(modes, modes, { message: 'p_modes exceeds the maximum payload size' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('reports an undersized-wire server rejection without serializing error details; transport failure is harmless', async () => {
    const { reportProgressPayload } = await import('@/utils/progressPayloadDiagnostics');
    vi.mocked(fetch).mockImplementation(() => {
      throw new TypeError('transport unavailable');
    });
    const modes = { pvp: createDefaultOwnedProgressData() };
    expect(() =>
      reportProgressPayload(modes, modes, {
        message: 'p_modes exceeds the maximum payload size',
        details: 'secret-user',
      })
    ).not.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = vi.mocked(fetch).mock.calls[0]![1]!.body as string;
    expect(body).toContain('payload_too_large');
    expect(body).not.toContain('secret-user');
  });
});
