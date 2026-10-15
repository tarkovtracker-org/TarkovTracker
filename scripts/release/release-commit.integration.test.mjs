// @vitest-environment node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import semanticRelease from 'semantic-release';
import { expect, it, onTestFinished } from 'vitest';
const { fixture, git } = await import(
  new URL('../workflow-tests/helpers/automation-fixture.mjs', import.meta.url)
);
it('semantic-release stops after reviewed PR staging without any tag or main push', async () => {
  const f = fixture({ after: onTestFinished });
  const ghPath = join(f.env.PATH.split(':')[0], 'gh');
  const mock = readFileSync(ghPath, 'utf8');
  writeFileSync(
    ghPath,
    mock.replace(
      "if (args[0] === 'api') {",
      String.raw`  if (args[0] === 'api' && args.includes('repos/' + p.GITHUB_REPOSITORY + '/pulls')) {
    console.log('https://github.com/' + p.GITHUB_REPOSITORY + '/pull/901'); process.exit(0);
  }
  if (args[0] === 'api') {`
    )
  );
  const output = new PassThrough();
  output.resume();
  await expect(
    semanticRelease(
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
    )
  ).rejects.toHaveProperty('code', 'RELEASE_PR_PREPARED');
  expect(git(f.repo, '--git-dir', f.remote, 'rev-parse', 'main')).toBe(f.base);
  expect(git(f.repo, '--git-dir', f.remote, 'tag', '--list')).toBe('');
  expect(git(f.repo, 'rev-list', '--count', `${f.base}..HEAD`)).toBe('1');
}, 30000);
