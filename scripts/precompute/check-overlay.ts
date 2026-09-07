import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { API_SUPPORTED_LANGUAGES } from '@/utils/constants';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import { compareOverlayFleet, type OverlayManifest } from './verify-overlay';
const { values } = parseArgs({ options: { origin: { type: 'string', default: 'https://tarkovtracker.org' }, output: { type: 'string', default: '/tmp/tarkov-overlay-fleet.json' } } });
const getJson = async (url: string) => {
  const response = await fetch(url, { headers: { 'User-Agent': 'TarkovTracker-overlay-verification/1.0' }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
};
const published = await getJson('https://raw.githubusercontent.com/tarkovtracker-org/tarkov-data-overlay/main/dist/overlay.json');
let manifest: OverlayManifest | null = null;
try { manifest = await getJson(`${values.origin}/api/tarkov/overlay-status`); } catch (error) { console.error(String(error)); }
const served = [];
for (const lang of API_SUPPORTED_LANGUAGES) for (const gameMode of VALID_GAME_MODES) {
  try {
    const payload = await getJson(`${values.origin}/api/tarkov/tasks-core?lang=${lang}&gameMode=${gameMode}`);
    served.push({ lang, gameMode, overlay: payload.dataOverlay ?? {} });
  } catch (error) { console.error(String(error)); }
}
const rows = compareOverlayFleet(published.$meta, manifest, served);
await writeFile(values.output!, JSON.stringify({ checkedAt: new Date().toISOString(), rows }, null, 2));
console.log(JSON.stringify({ output: values.output, total: rows.length, current: rows.filter(row => row.status === 'current').length, propagating: rows.filter(row => row.status === 'propagating').length, drift: rows.filter(row => row.status === 'drift').length, unverified: rows.filter(row => row.status === 'unverified').length }));
if (rows.some(row => row.status === 'drift' || row.status === 'unverified')) process.exitCode = 1;
