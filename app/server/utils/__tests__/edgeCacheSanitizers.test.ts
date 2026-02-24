import { describe, expect, it } from 'vitest';
import {
  sanitizeErrorMessage,
  sanitizeGraphQLErrors,
  sanitizeVariables,
} from '@/server/utils/edgeCacheSanitizers';
describe('edge cache sanitizers', () => {
  it('sanitizes host and path details from error messages', () => {
    const urlMessage = 'query failed at https://api.example.com/private/file.sql';
    const pathMessage = 'query failed at /var/tmp/private/file.sql';
    expect(sanitizeErrorMessage(urlMessage)).toContain('[host]');
    expect(sanitizeErrorMessage(pathMessage)).toContain('[path]');
  });
  it('redacts sensitive keys recursively', () => {
    const result = sanitizeVariables({
      nested: {
        token: 'abc',
      },
      userId: '42',
    });
    expect(result).toEqual({
      nested: {
        token: '[redacted]',
      },
      userId: '[redacted]',
    });
  });
  it('handles graphql error arrays and unknown shapes', () => {
    const arrayResult = sanitizeGraphQLErrors([{ message: 'boom', extensions: { code: 'BAD' } }]);
    const objectResult = sanitizeGraphQLErrors({ message: 'boom' });
    expect(arrayResult).toContain('BAD');
    expect(objectResult).toContain('Non-array error object');
  });
});
