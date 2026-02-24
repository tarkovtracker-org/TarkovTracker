import { describe, expect, it, vi } from 'vitest';
import { createTarkovFetcher } from '@/server/utils/tarkovFetcher';
describe('createTarkovFetcher', () => {
  it('retries failed requests and succeeds on a later attempt', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('network-failure'))
      .mockResolvedValueOnce({ data: { items: [] } });
    const sleep = vi.fn(async () => undefined);
    const logger = { error: vi.fn(), warn: vi.fn() };
    const run = createTarkovFetcher<{ data: { items: unknown[] } }>(
      'query Test { items { id } }',
      {},
      { maxRetries: 2, deps: { fetcher, logger, sleep } }
    );
    const result = await run();
    expect(result).toEqual({ data: { items: [] } });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });
  it('throws when graphql response returns an errors array', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      errors: [{ message: 'bad', extensions: { code: 'BAD_REQUEST' } }],
    });
    const logger = { error: vi.fn(), warn: vi.fn() };
    const run = createTarkovFetcher(
      'query Test { items { id } }',
      {},
      {
        maxRetries: 1,
        deps: { fetcher, logger },
      }
    );
    await expect(run()).rejects.toThrow('GraphQL errors:');
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
  it('redacts sensitive variables in final failure logs', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
    const logger = { error: vi.fn(), warn: vi.fn() };
    const run = createTarkovFetcher(
      'query Test($token: String!) { items { id } }',
      { token: 'secret-value', nested: { apiKey: 'top-secret' } },
      {
        maxRetries: 1,
        deps: { fetcher, logger },
      }
    );
    await expect(run()).rejects.toThrow('boom');
    expect(logger.error).toHaveBeenCalledWith(
      '[TarkovFetcher] All 1 attempts failed',
      expect.objectContaining({
        variables: {
          nested: { apiKey: '[redacted]' },
          token: '[redacted]',
        },
      })
    );
  });
});
