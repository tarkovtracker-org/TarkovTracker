import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const RECEIPT_LIMIT = 1024 * 1024;
/** Parse one bounded receipt from a run-owned immutable artifact, without extracting candidate files. */
export async function readPromotionArchive(bytes) {
  if (bytes.byteLength > RECEIPT_LIMIT) throw new Error('Promotion archive is oversized.');
  const directory = await mkdtemp(join(tmpdir(), 'release-promotion-'));
  try {
    const archive = join(directory, 'receipt.zip');
    await writeFile(archive, bytes);
    return parseReceipt(archive);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
function parseReceipt(archive) {
  const entries = execFileSync('unzip', ['-Z1', archive], {
    encoding: 'utf8',
    maxBuffer: 8192,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (entries !== 'release-promotion.json')
    throw new Error('Unexpected promotion receipt contents.');
  const json = execFileSync('unzip', ['-p', archive, entries], {
    encoding: 'utf8',
    maxBuffer: RECEIPT_LIMIT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(json);
}
