import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API_SUPPORTED_LANGUAGES } from '@/utils/constants';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import { compareOverlayFleet, type OverlayManifest } from './verify-overlay';
// This command verifies the production fleet and writes a private, unique report.
const productionOrigin = 'https://tarkovtracker.org';
const getJson = async (url: string) => {
  const response = await fetch(url, { headers: { 'User-Agent': 'TarkovTracker-overlay-verification/1.0' }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
};
const published = await getJson('https://raw.githubusercontent.com/tarkovtracker-org/tarkov-data-overlay/main/dist/overlay.json');
let manifest: OverlayManifest | null = null;
try { manifest = await getJson(`${productionOrigin}/api/tarkov/overlay-status`); } catch (error) { console.error(String(error)); }
const served = [];
for (const lang of API_SUPPORTED_LANGUAGES) for (const gameMode of VALID_GAME_MODES) {
  try {
    const payload = await getJson(`${productionOrigin}/api/tarkov/tasks-core?lang=${lang}&gameMode=${gameMode}`);
    served.push({ lang, gameMode, overlay: payload.dataOverlay ?? {} });
  } catch (error) { console.error(String(error)); }
}
const rows = compareOverlayFleet(published.$meta, manifest, served);
const reportDirectory = await mkdtemp(join(tmpdir(), 'tarkov-overlay-fleet-'));
const output = join(reportDirectory, 'report.json');
await writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), rows }, null, 2), { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ output, total: rows.length, current: rows.filter(row => row.status === 'current').length, propagating: rows.filter(row => row.status === 'propagating').length, drift: rows.filter(row => row.status === 'drift').length, unverified: rows.filter(row => row.status === 'unverified').length }));
if (rows.some(row => row.status === 'drift' || row.status === 'unverified')) process.exitCode = 1;
