import { describe, expect, it } from 'vitest';
import { createAdminError } from '@/server/utils/adminError';
import { ADMIN_ERROR_CODES } from '@/utils/adminErrors';
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
