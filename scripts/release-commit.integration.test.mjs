// @vitest-environment node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import semanticRelease from 'semantic-release';
import { expect, it, onTestFinished } from 'vitest';
import { fixture, git } from './ci-tests/helpers/automation-fixture.mjs';
it('semantic-release core tags the exact version commit prepared and promoted by the gate', async () => {
  const f = fixture({ after: onTestFinished });
  const output = new PassThrough();
  output.resume();
  const result = await semanticRelease(
    {
      branches: ['main'],
      repositoryUrl: f.remote,
      plugins: [
        {
          analyzeCommits: () => 'patch',
          generateNotes: () => 'Validated fixture release',
          prepare: (_config, context) => {
            writeFileSync(
              join(f.repo, 'package.json'),
              JSON.stringify({ private: true, version: context.nextRelease.version })
            );
            writeFileSync(join(f.repo, 'CHANGELOG.md'), context.nextRelease.notes);
          },
        },
        fileURLToPath(new URL('./release-commit.mjs', import.meta.url)),
      ],
    },
    {
      cwd: f.repo,
      // Model this fixture's main push, never the enclosing PR runner's event/checkout.
      env: {
        ...f.env,
        CI: 'true',
        GITHUB_ACTIONS: 'true',
        GITHUB_EVENT_NAME: 'push',
        GITHUB_EVENT_PATH: '',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: f.base,
        GITHUB_WORKSPACE: f.repo,
      },
      stdout: output,
      stderr: output,
    }
  );
  expect(result).toHaveProperty('nextRelease');
  const sha = git(f.repo, 'rev-parse', 'HEAD');
  expect(result.nextRelease.gitHead).toBe(sha);
  expect(git(f.repo, '--git-dir', f.remote, 'rev-parse', 'main')).toBe(sha);
  expect(git(f.repo, '--git-dir', f.remote, 'rev-parse', result.nextRelease.gitTag)).toBe(sha);
  expect(git(f.repo, 'rev-list', '--count', `${f.base}..HEAD`)).toBe('1');
}, 30000);
