import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
if (process.env.TARKOVTRACKER_SKIP_NUXT_PREPARE !== 'true') {
  const manifest = new URL(import.meta.resolve('nuxt/package.json'));
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8'));
  const cli = fileURLToPath(new URL(bin.nuxt, manifest));
  execFileSync(process.execPath, [cli, 'prepare'], { stdio: 'inherit' });
}
