#!/usr/bin/env node
/**
 * Focused drift checks for docs/SYSTEMS.md.
 *
 * Verifies the most volatile, easily-checkable facts the doc records against
 * the actual codebase so drift is caught automatically in CI. Checks:
 *
 *   1. Every /api/tarkov/* endpoint listed in the doc's endpoint table has a
 *      matching app/server/api/tarkov/*.get.ts handler file.
 *   2. Every implementation file path mentioned in the doc exists on disk
 *      (glob patterns like `*.get.ts` are expanded against their directory).
 *   3. The KV namespace binding name documented (`TARKOV_DATA`) matches the
 *      binding in wrangler.toml and the PRECOMPUTED_KV_BINDING constant in
 *      precomputedTarkov.ts.
 *   4. The supported languages listed in the doc (if any) match the locale
 *      directories in app/locales/. The doc does not currently enumerate
 *      languages, so this check is a no-op until it does.
 *
 * Exits 0 when all checks pass, 1 with a per-mismatch report otherwise.
 * Uses only Node.js built-in modules so it runs without installing deps.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';

const ROOT = process.cwd();
const SYSTEMS_MD = join(ROOT, 'docs', 'SYSTEMS.md');
const TARKOV_API_DIR = join(ROOT, 'app', 'server', 'api', 'tarkov');
const LOCALES_DIR = join(ROOT, 'app', 'locales');
const WRANGLER_TOML = join(ROOT, 'wrangler.toml');
const PRECOMPUTED_TARKOV_TS = join(ROOT, 'app', 'server', 'utils', 'precomputedTarkov.ts');

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function readText(filePath) {
  return readFileSync(filePath, 'utf-8');
}

function listTarkovHandlers() {
  if (!existsSync(TARKOV_API_DIR)) {
    fail(`Cannot list Tarkov handlers: ${TARKOV_API_DIR} does not exist.`);
    return [];
  }
  if (!statSync(TARKOV_API_DIR).isDirectory()) {
    fail(`Cannot list Tarkov handlers: ${TARKOV_API_DIR} is not a directory.`);
    return [];
  }
  return readdirSync(TARKOV_API_DIR)
    .filter((f) => f.endsWith('.get.ts'))
    .map((f) => f.replace(/\.get\.ts$/, ''));
}

/**
 * Extract the /api/tarkov/* endpoints from the endpoint table in SYSTEMS.md.
 * The table rows look like `| `/api/tarkov/bootstrap` | ... |`.
 */
function extractDocumentedEndpoints(md) {
  const endpoints = [];
  const endpointRe = /`\s*\/api\/tarkov\/([a-z0-9-]+)\s*`/g;
  let match;
  while ((match = endpointRe.exec(md)) !== null) {
    endpoints.push(match[1]);
  }
  return [...new Set(endpoints)];
}

/**
 * Extract backtick-quoted file paths from the doc. Handles plain paths
 * (`app/server/utils/edgeCache.ts`) and glob patterns (`app/server/api/tarkov/*.get.ts`).
 * Only paths that look like repo-relative files (contain a slash and a known
 * extension) are considered.
 */
function extractDocumentedPaths(md) {
  // Strip fenced code blocks (```...```) so they don't interfere with inline
  // backtick extraction. File paths in mermaid diagrams are inside fenced
  // blocks; the "Files" sections use inline backticks we want to capture.
  const stripped = md.replace(/```[\s\S]*?```/g, '');
  const paths = new Set();
  const codeSpanRe = /`([^`]+)`/g;
  let match;
  while ((match = codeSpanRe.exec(stripped)) !== null) {
    const span = match[1];
    // Skip URLs, env vars, header names, cache keys, and prose fragments.
    if (span.includes('://')) continue;
    if (!span.includes('/')) continue;
    // Must end with a file-like extension or a glob + extension.
    if (!/\.[a-z0-9]+$/i.test(span)) continue;
    // Skip things that are clearly not file paths (e.g. "tasks[*].name").
    if (/\s/.test(span)) continue;
    paths.add(span);
  }
  return [...paths];
}

function pathExists(relativePath) {
  const absolute = join(ROOT, relativePath);
  if (relativePath.includes('*')) {
    // Glob: check that the directory exists and at least one file matches.
    const dir = dirname(absolute);
    if (!existsSync(dir)) return false;
    const pattern = basename(absolute)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '.*');
    const re = new RegExp(`^${pattern}$`);
    try {
      return readdirSync(dir).some((f) => re.test(f));
    } catch {
      return false;
    }
  }
  if (!existsSync(absolute)) return false;
  return statSync(absolute).isFile();
}

function checkEndpoints(md) {
  const documented = extractDocumentedEndpoints(md);
  if (documented.length === 0) {
    fail(
      'No /api/tarkov/* endpoints found in SYSTEMS.md endpoint table. The endpoint section is required.'
    );
    return;
  }
  const handlers = new Set(listTarkovHandlers());
  for (const endpoint of documented) {
    if (!handlers.has(endpoint)) {
      fail(
        `SYSTEMS.md documents endpoint "/api/tarkov/${endpoint}" but no handler file ` +
          `app/server/api/tarkov/${endpoint}.get.ts exists.`
      );
    }
  }
  // Report handlers that exist in code but are not documented (informational).
  const undocumented = [...handlers].filter((h) => !documented.includes(h));
  if (undocumented.length > 0) {
    warnings.push(
      `Handler(s) exist without a SYSTEMS.md endpoint entry: ${undocumented.join(', ')}. ` +
        `Add them to the endpoint table if they are part of the Tarkov.dev data integration.`
    );
  }
}

function checkDocumentedPaths(md) {
  const paths = extractDocumentedPaths(md);
  if (paths.length === 0) {
    fail(
      'No implementation file paths found in SYSTEMS.md. The implementation paths section is required.'
    );
    return;
  }
  for (const p of paths) {
    if (!pathExists(p)) {
      fail(`SYSTEMS.md references path "${p}" but it does not exist on disk.`);
    }
  }
}

function checkKvBinding(md) {
  // The doc states the binding name is `TARKOV_DATA` (PRECOMPUTED_KV_BINDING).
  const bindingMatch = md.match(/KV binding name is `([A-Z_]+)`/);
  const documentedBinding = bindingMatch ? bindingMatch[1] : null;
  if (!documentedBinding) {
    fail(
      'Could not find a KV binding name declaration in SYSTEMS.md. The KV binding section is required.'
    );
    return;
  }

  // Check wrangler.toml binding.
  if (!existsSync(WRANGLER_TOML)) {
    fail(`Cannot verify KV binding: ${WRANGLER_TOML} does not exist.`);
    return;
  }
  const wrangler = readText(WRANGLER_TOML);
  // Scope the binding search to [[kv_namespaces]] / [[env.*.kv_namespaces]] blocks so
  // a binding name in a non-KV resource (Durable Objects, R2, etc.) cannot satisfy the check.
  // Only active (non-commented) binding lines are considered.
  const kvBlocks = [];
  const blockRe = /^\s*\[\[(env\.\w+\.)?kv_namespaces\]\]/;
  const lines = wrangler.split('\n');
  let inKvBlock = false;
  for (const line of lines) {
    if (blockRe.test(line)) {
      inKvBlock = true;
      continue;
    }
    if (/^\s*\[/.test(line) && inKvBlock) {
      inKvBlock = false;
    }
    if (inKvBlock) kvBlocks.push(line);
  }
  const kvText = kvBlocks.filter((l) => !l.trim().startsWith('#')).join('\n');
  const wranglerBindingRe = new RegExp(`binding\\s*=\\s*"${documentedBinding}"`);
  if (!wranglerBindingRe.test(kvText)) {
    fail(
      `SYSTEMS.md documents KV binding "${documentedBinding}" but wrangler.toml does not ` +
        `declare it inside a [[kv_namespaces]] block.`
    );
  }

  // Check PRECOMPUTED_KV_BINDING constant in precomputedTarkov.ts.
  if (existsSync(PRECOMPUTED_TARKOV_TS)) {
    const source = readText(PRECOMPUTED_TARKOV_TS);
    const constRe = new RegExp(`PRECOMPUTED_KV_BINDING\\s*=\\s*['"]${documentedBinding}['"]`);
    if (!constRe.test(source)) {
      fail(
        `SYSTEMS.md documents KV binding "${documentedBinding}" but ` +
          `precomputedTarkov.ts does not set PRECOMPUTED_KV_BINDING to that value.`
      );
    }
  } else {
    fail(`Cannot verify KV binding: ${PRECOMPUTED_TARKOV_TS} does not exist.`);
  }
}

function checkSupportedLanguages(md) {
  // SYSTEMS.md does not currently enumerate supported languages. When it does
  // (as a backtick-quoted, comma/space-separated list on a line containing
  // "supported languages" or similar), verify it against app/locales/.
  if (!existsSync(LOCALES_DIR)) {
    fail(`Cannot verify supported languages: ${LOCALES_DIR} does not exist.`);
    return;
  }
  if (!statSync(LOCALES_DIR).isDirectory()) {
    fail(`Cannot verify supported languages: ${LOCALES_DIR} is not a directory.`);
    return;
  }
  const localeFiles = readdirSync(LOCALES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
  const localeSet = new Set(localeFiles);

  // Look for an explicit language list in the doc. Capture the full section
  // after the "Supported languages" heading to handle multiline lists.
  const sectionRe = /[Ss]upported languages?[:\s]+([\s\S]*?)(?:\n#|\n##|\n$|$)/;
  const match = md.match(sectionRe);
  if (!match) {
    // No language list in the doc — nothing to verify yet.
    return;
  }
  const raw = match[1];
  const langCodes = [...raw.matchAll(/`([a-z]{2})`/g)].map((m) => m[1]);
  if (langCodes.length === 0) return;

  for (const code of langCodes) {
    if (!localeSet.has(code)) {
      fail(
        `SYSTEMS.md lists supported language "${code}" but no locale file ` +
          `app/locales/${code}.json exists.`
      );
    }
  }
  const undocumentedLocales = localeFiles.filter((c) => !langCodes.includes(c));
  if (undocumentedLocales.length > 0) {
    fail(
      `Locale files exist without a SYSTEMS.md language entry: ${undocumentedLocales.join(', ')}. ` +
        `Add them to the supported languages list or remove them from app/locales/.`
    );
  }
}

function main() {
  if (!existsSync(SYSTEMS_MD)) {
    console.error(`SYSTEMS.md not found at ${SYSTEMS_MD}`);
    process.exit(1);
  }
  const md = readText(SYSTEMS_MD);

  checkEndpoints(md);
  checkDocumentedPaths(md);
  checkKvBinding(md);
  checkSupportedLanguages(md);

  if (warnings.length > 0) {
    console.warn('Warnings (non-fatal):');
    for (const w of warnings) console.warn(`  - ${w}`);
    console.warn();
  }

  if (errors.length > 0) {
    console.error('SYSTEMS.md drift detected:');
    for (const e of errors) console.error(`  - ${e}`);
    console.error(`\n${errors.length} error(s). Fix the doc or the code in the same PR.`);
    process.exit(1);
  }

  console.log('systems:check — all drift checks passed.');
  process.exit(0);
}

main();
