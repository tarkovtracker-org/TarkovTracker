// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepare } from './release-commit.mjs';
vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
const context = {
  branch: { name: 'main' },
  cwd: '/repo',
  env: { GITHUB_TOKEN: 'mock-token', RELEASE_CI_TOKEN: 'mock-ci-token' },
  nextRelease: { version: '1.2.3' },
};
describe('release commit preparation', () => {
  beforeEach(() => vi.resetAllMocks());
  it('passes the release context to the staging gate without putting credentials in arguments', () => {
    prepare({}, context);
    expect(execFileSync).toHaveBeenCalledExactlyOnceWith(
      '/bin/bash',
      [fileURLToPath(new URL('./release-commit.sh', import.meta.url))],
      {
        cwd: '/repo',
        env: { ...context.env, RELEASE_VERSION: '1.2.3' },
        stdio: 'inherit',
      }
    );
  });
  it('refuses publication from another branch before invoking Git', () => {
    expect(() => prepare({}, { ...context, branch: { name: 'develop' } })).toThrow(
      'Version promotion only supports main.'
    );
    expect(execFileSync).not.toHaveBeenCalled();
  });
  it('propagates gate failure so semantic-release cannot tag or publish', () => {
    execFileSync.mockImplementation(() => {
      throw new Error('CI rejected');
    });
    expect(() => prepare({}, context)).toThrow('CI rejected');
  });
});
