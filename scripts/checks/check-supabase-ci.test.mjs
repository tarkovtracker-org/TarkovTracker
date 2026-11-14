// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withCiDatabaseConfig, portDiagnostics, requireLocalDocker } from './check-supabase-ci.mjs';
const directories = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});
async function configFixture(port = 54322) {
  const directory = await mkdtemp(join(tmpdir(), 'supabase-ci-test-'));
  directories.push(directory);
  const configPath = join(directory, 'config.toml');
  const source = `project_id = "existing-project"\r\n\r\n[api]\r\nport = 54321\r\n[db]\r\n# Preserve this comment.\r\nport = ${port}\r\nshadow_port = 54320\r\n[db.pooler]\r\nport = 54329\r\n`;
  await writeFile(configPath, source);
  return { configPath, source, diagnose: vi.fn(), log: vi.fn() };
}
function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(server.address().port));
  });
}
const close = (server) => new Promise((resolve) => server.close(resolve));
function databasePort(source) {
  return Number(/^\[db\]\r?\n[\s\S]*?^port = (\d+)/m.exec(source)[1]);
}
function project(source) {
  return /^project_id = "([\w-]+)"/m.exec(source)[1];
}
describe('isolated CI database configuration', () => {
  it('starts on another available port when the configured port is occupied', async () => {
    const owner = createServer();
    const occupied = await listen(owner);
    const f = await configFixture(occupied);
    let selected;
    try {
      const result = await withCiDatabaseConfig({
        ...f,
        run: async () => {
          const configured = await readFile(f.configPath, 'utf8');
          selected = databasePort(configured);
          const database = createServer();
          await listen(database, selected);
          await close(database);
          expect(project(configured)).toMatch(/^ci-[a-f0-9-]+$/);
          return 0;
        },
      });
      expect(result).toBe(0);
      expect(selected).not.toBe(occupied);
      expect(owner.listening).toBe(true);
      expect(f.diagnose).toHaveBeenCalledWith(occupied);
      expect(await readFile(f.configPath, 'utf8')).toBe(f.source);
    } finally {
      await close(owner);
    }
  });
  it('uses a different owned project for each run and preserves other config fields', async () => {
    const f = await configFixture();
    const projects = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await withCiDatabaseConfig({
        ...f,
        run: async () => {
          const configured = await readFile(f.configPath, 'utf8');
          projects.push(project(configured));
          expect(configured).toContain('[api]\r\nport = 54321');
          expect(configured).toContain('shadow_port = 54320');
          expect(configured).toContain('[db.pooler]\r\nport = 54329');
          expect(configured).toContain('# Preserve this comment.');
          return 0;
        },
      });
    }
    expect(new Set(projects).size).toBe(2);
    expect(projects).not.toContain('existing-project');
    expect(await readFile(f.configPath, 'utf8')).toBe(f.source);
  });
  it('uses a project ID unchanged by the pinned CLI container-name sanitization', async () => {
    const f = await configFixture();
    await withCiDatabaseConfig({
      ...f,
      run: async () => {
        const raw = project(await readFile(f.configPath, 'utf8'));
        // CLI 2.122.0 docker-ids.ts caps IDs at 40 characters. Concurrency tests use the raw ID.
        expect(raw.length).toBeLessThanOrEqual(40);
        expect(raw).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
        return 0;
      },
    });
  });
  it.each([1, 17])('restores config after validation exits with code %i', async (code) => {
    const f = await configFixture();
    expect(await withCiDatabaseConfig({ ...f, run: async () => code })).toBe(code);
    expect(await readFile(f.configPath, 'utf8')).toBe(f.source);
  });
  it('restores config when the database-check process cannot start', async () => {
    const f = await configFixture();
    const error = new Error('spawn failed');
    await expect(
      withCiDatabaseConfig({
        ...f,
        run: async () => {
          throw error;
        },
      })
    ).rejects.toBe(error);
    expect(await readFile(f.configPath, 'utf8')).toBe(f.source);
  });
  it('restores config when logging fails after configuration is written', async () => {
    const f = await configFixture();
    const error = new Error('log failed');
    const run = vi.fn();
    await expect(
      withCiDatabaseConfig({
        ...f,
        run,
        log: () => {
          throw error;
        },
      })
    ).rejects.toBe(error);
    expect(run).not.toHaveBeenCalled();
    expect(await readFile(f.configPath, 'utf8')).toBe(f.source);
  });
  it('preserves an unexpected concurrent edit instead of overwriting it during cleanup', async () => {
    const f = await configFixture();
    const concurrent = `${f.source}# concurrent edit\n`;
    await expect(
      withCiDatabaseConfig({
        ...f,
        run: async () => {
          await writeFile(f.configPath, concurrent);
          return 0;
        },
      })
    ).rejects.toThrow('changed');
    expect(await readFile(f.configPath, 'utf8')).toBe(concurrent);
  });
  it.each([
    (source) => source.replace('[db]', '[other]'),
    (source) => `${source}[db]\nport = 54323\n`,
    (source) => source.replace('port = 54322', 'port = 54322\nport = 54323'),
    (source) => `${source}project_id = "duplicate"\n`,
  ])(
    'rejects missing or ambiguous config without writing it or running validation',
    async (malform) => {
      const f = await configFixture();
      const source = malform(f.source);
      await writeFile(f.configPath, source);
      const run = vi.fn();
      await expect(withCiDatabaseConfig({ ...f, run })).rejects.toThrow(/Expected one/);
      expect(run).not.toHaveBeenCalled();
      expect(await readFile(f.configPath, 'utf8')).toBe(source);
    }
  );
  it('refuses the CI entrypoint locally before looking for Docker or changing config', async () => {
    const f = await configFixture();
    const result = spawnSync(process.execPath, ['scripts/checks/check-supabase-ci.mjs'], {
      env: { ...process.env, CI: 'false' },
      encoding: 'utf8',
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CI-only wrapper');
    expect(await readFile(f.configPath, 'utf8')).toBe(f.source);
  });
  it.each(['SUPABASE_PROJECT_ID', 'SUPABASE_DB_PORT'])(
    'rejects %s overrides before Docker or configuration access',
    (name) => {
      const result = spawnSync(process.execPath, ['scripts/checks/check-supabase-ci.mjs'], {
        env: { ...process.env, CI: 'true', [name]: '12345' },
        encoding: 'utf8',
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('CI database isolation forbids');
    }
  );
});
describe('CI Docker target verification', () => {
  it.each(['unix:///var/run/docker.sock', 'npipe:////./pipe/docker_engine'])(
    'accepts local Docker endpoint %s',
    (endpoint) => {
      const run = vi.fn().mockReturnValue({ status: 0, stdout: endpoint });
      expect(() => requireLocalDocker({ DOCKER_HOST: endpoint }, run)).not.toThrow();
      expect(run.mock.calls[0][2].env.DOCKER_HOST).toBeUndefined();
    }
  );
  it('rejects a remote DOCKER_HOST before executing any command', () => {
    const run = vi.fn();
    expect(() => requireLocalDocker({ DOCKER_HOST: 'tcp://remote.example:2376' }, run)).toThrow(
      'local socket'
    );
    expect(run).not.toHaveBeenCalled();
  });
  it('rejects a remote named context and verifies it without connection overrides', () => {
    const run = vi.fn().mockReturnValue({ status: 0, stdout: 'ssh://remote.example' });
    expect(() =>
      requireLocalDocker({ DOCKER_CONTEXT: 'named', DOCKER_TLS_VERIFY: '1' }, run)
    ).toThrow('local socket');
    expect(run.mock.calls[0][1]).toContain('named');
    expect(run.mock.calls[0][2].env.DOCKER_CONTEXT).toBeUndefined();
    expect(run.mock.calls[0][2].env.DOCKER_TLS_VERIFY).toBeUndefined();
  });
  it('fails closed when Docker context inspection fails', () => {
    const run = vi.fn().mockReturnValue({ status: 1, stderr: 'failed' });
    expect(() => requireLocalDocker({}, run)).toThrow('Cannot verify');
  });
});
describe('bounded database port diagnostics', () => {
  it('reports the listener and matching Docker owner without inspecting environment data', () => {
    const run = vi.fn((binary) =>
      binary === 'ss'
        ? { status: 0, stdout: 'LISTEN 0 128 0.0.0.0:54322 users:(("postgres",pid=123))\n' }
        : {
            status: 0,
            stdout:
              'abc\tother-db\t0.0.0.0:54322->5432/tcp\nxyz\tunrelated\t0.0.0.0:154322->5432/tcp\n',
          }
    );
    const report = portDiagnostics(54322, run).join('\n');
    expect(report).toContain('pid=123');
    expect(report).toContain('other-db');
    expect(report).not.toContain('unrelated');
    expect(run).toHaveBeenCalledWith('ss', ['-ltnp', '( sport = :54322 )']);
    expect(run).toHaveBeenCalledWith('docker', [
      'ps',
      '--all',
      '--format',
      '{{.ID}}\t{{.Names}}\t{{.Ports}}',
    ]);
    expect(run.mock.calls.some(([, args]) => args.includes('inspect'))).toBe(false);
  });
  it('keeps Docker ownership diagnostics when ss is unavailable', () => {
    const run = vi.fn((binary) =>
      binary === 'ss'
        ? { status: null, error: new Error('unavailable') }
        : { status: 0, stdout: 'abc\tother-db\t[::]:54322->5432/tcp\n' }
    );
    const report = portDiagnostics(54322, run).join('\n');
    expect(report).toContain('ss: unavailable');
    expect(report).toContain('other-db');
  });
  it.each([0, 65536, '54322; arbitrary-command'])(
    'rejects invalid diagnostic port %s before any command',
    (port) => {
      const run = vi.fn();
      expect(() => portDiagnostics(port, run)).toThrow('port');
      expect(run).not.toHaveBeenCalled();
    }
  );
});
