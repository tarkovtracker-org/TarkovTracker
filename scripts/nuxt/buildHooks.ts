import { readdirSync, readFileSync, writeFileSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { stripBareNodeImports } from '../../app/utils/stripBareNodeImports';
function outputEntries(directory: string): Dirent[] {
  try {
    return readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}
function stripOutputFile(path: string) {
  try {
    const source = readFileSync(path, 'utf8');
    const next = stripBareNodeImports(source);
    if (next !== source) writeFileSync(path, next);
  } catch {
    // The path may have vanished since the directory was read.
  }
}
function walkOutput(directory: string) {
  for (const entry of outputEntries(directory)) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walkOutput(path);
    else if (/\.(m?js|cjs)$/.test(entry.name)) stripOutputFile(path);
  }
}
export function cleanCloudflareOutput(preset: unknown, directory: string) {
  if (String(preset || '').includes('cloudflare')) walkOutput(directory);
}
type AutoImport = { as?: string; from?: string; name: string };
const blockedBySource = Object.entries({
  '/app/utils/perf': ['meta'],
  '/app/utils/constants': ['string'],
  '/app/utils/mapTime': ['string'],
  '/app/utils/skillHelpers': ['string'],
  '/app/stores/useApp': ['actions', 'getters'],
  '/app/stores/useTarkov': ['actions'],
  '@nuxt/ui/dist/runtime/composables/useResizable': ['options'],
});
function isBlocked({ from, name, as }: AutoImport) {
  const source = from ?? '';
  return blockedBySource.some(
    ([pattern, names]) =>
      source.includes(pattern) && (names.includes(name) || names.includes(as ?? name))
  );
}
export function filterAutoImports(imports: AutoImport[]) {
  for (let index = imports.length - 1; index >= 0; index--) {
    const imported = imports[index];
    if (imported && isBlocked(imported)) imports.splice(index, 1);
  }
}
