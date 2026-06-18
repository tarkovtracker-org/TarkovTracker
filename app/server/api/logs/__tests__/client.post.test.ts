import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event } from 'h3';
const {
  mockGetRequestHeader,
  mockReadBody,
  mockSetResponseHeader,
  mockSetResponseStatus,
  mockLogger,
} = vi.hoisted(() => ({
  mockGetRequestHeader: vi.fn(),
  mockReadBody: vi.fn(),
  mockSetResponseHeader: vi.fn(),
  mockSetResponseStatus: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3');
  return {
    ...actual,
    defineEventHandler: (handler: unknown) => handler,
    getRequestHeader: mockGetRequestHeader,
    readBody: mockReadBody,
    setResponseHeader: mockSetResponseHeader,
    setResponseStatus: mockSetResponseStatus,
  };
});
vi.mock('@/server/utils/logger', () => ({
  createLogger: () => mockLogger,
}));
describe('client logs endpoint', () => {
  const event = {
    node: {
      req: {
        socket: {
          remoteAddress: '198.51.100.8',
        },
      },
    },
  } as unknown as H3Event;
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRequestHeader.mockReturnValue(undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('returns 204 for unreadable payloads', async () => {
    mockReadBody.mockRejectedValueOnce(new Error('parse-error'));
    const { default: handler } = await import('@/server/api/logs/client.post');
    const response = await handler(event);
    expect(response).toBeNull();
    expect(mockSetResponseHeader).toHaveBeenCalledWith(
      event,
      'Cache-Control',
      'no-store, max-age=0'
    );
    expect(mockSetResponseStatus).toHaveBeenCalledWith(event, 204);
    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
  it('logs sanitized payloads at the requested level', async () => {
    mockGetRequestHeader.mockImplementation((_event, name: string) =>
      name === 'cf-connecting-ip' ? '203.0.113.9' : undefined
    );
    mockReadBody.mockResolvedValueOnce({
      args: Array.from({ length: 25 }, (_value, index) => `arg-${index}`),
      href: ' https://tarkovtracker.org/tasks ',
      level: 'warn',
      timestamp: '2026-02-24T10:11:12.000Z',
    });
    const { default: handler } = await import('@/server/api/logs/client.post');
    await handler(event);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Client log',
      expect.objectContaining({
        args: Array.from({ length: 20 }, (_value, index) => `arg-${index}`),
        clientIp: '203.0.113.9',
        href: 'https://tarkovtracker.org/tasks',
        timestamp: '2026-02-24T10:11:12.000Z',
      })
    );
    expect(mockSetResponseStatus).toHaveBeenCalledWith(event, 204);
  });
  it('falls back to info level and generated timestamp for invalid values', async () => {
    mockReadBody.mockResolvedValueOnce({
      args: ['a'],
      href: '',
      level: 'trace',
      timestamp: 123,
    });
    const { default: handler } = await import('@/server/api/logs/client.post');
    await handler(event);
    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Client log',
      expect.objectContaining({
        args: ['a'],
        clientIp: '198.51.100.8',
        href: null,
        timestamp: expect.any(String),
      })
    );
    expect(mockSetResponseStatus).toHaveBeenCalledWith(event, 204);
  });
});
