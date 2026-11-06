import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requireEvidence } from './review-admission-policy.mjs';
export async function readAdmissionArchive(bytes, head) {
  requireEvidence(bytes.byteLength <= 100000, 'Admission ZIP is oversized.');
  const directory = await mkdtemp(join(tmpdir(), 'review-admission-'));
  try {
    const archive = join(directory, 'receipt.zip');
    await writeFile(archive, bytes);
    return parseArchive(archive, head);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
function parseArchive(archive, head) {
  const entries = execFileSync('unzip', ['-Z1', archive], {
    encoding: 'utf8',
    maxBuffer: 8192,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
    killSignal: 'SIGKILL',
  }).replace(/\r?\n$/, '');
  requireEvidence(
    entries === `${head}.json`,
    'Admission artifact must contain exactly the expected receipt.'
  );
  const json = execFileSync('unzip', ['-p', archive, entries], {
    encoding: 'utf8',
    maxBuffer: 100000,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
    killSignal: 'SIGKILL',
  });
  return JSON.parse(json);
}
