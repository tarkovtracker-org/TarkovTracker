import { describe, expect, it } from 'vitest';
import { createAdminError } from '@/server/utils/adminError';
import { ADMIN_ERROR_CODES, getAdminErrorCode } from '@/utils/adminErrors';
describe('createAdminError', () => {
  it('keeps the stable code and serialized fallback message', () => {
    const error = createAdminError(400, ADMIN_ERROR_CODES.INVALID_CHANNEL, 'Invalid channel');
    expect(error).toMatchObject({
      data: { code: ADMIN_ERROR_CODES.INVALID_CHANNEL },
      statusCode: 400,
      statusMessage: 'Invalid channel',
    });
  });
});
describe('getAdminErrorCode', () => {
  it.each([
    {
      label: 'nested response data',
      error: { data: { data: { code: ADMIN_ERROR_CODES.INVALID_CHANNEL } } },
    },
    {
      label: 'direct response data',
      error: { data: { code: ADMIN_ERROR_CODES.INVALID_CHANNEL } },
    },
  ])('returns the allowlisted code from $label', ({ error }) => {
    expect(getAdminErrorCode(error)).toBe(ADMIN_ERROR_CODES.INVALID_CHANNEL);
  });
  it('returns null for unknown codes', () => {
    expect(getAdminErrorCode({ data: { data: { code: 'unknown_admin_error' } } })).toBeNull();
  });
  it.each([
    {
      label: 'top-level data getter',
      error: {
        get data(): unknown {
          throw new Error('inaccessible');
        },
      },
    },
    {
      label: 'nested data getter',
      error: {
        data: {
          get data(): unknown {
            throw new Error('inaccessible');
          },
        },
      },
    },
    {
      label: 'nested code getter',
      error: {
        data: {
          data: {
            get code(): unknown {
              throw new Error('inaccessible');
            },
          },
        },
      },
    },
  ])('returns null when $label throws', ({ error }) => {
    expect(getAdminErrorCode(error)).toBeNull();
  });
});
