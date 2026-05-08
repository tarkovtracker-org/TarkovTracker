#!/usr/bin/env node
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
const LOCALES_DIR = join(process.cwd(), 'app', 'locales');
const SOURCE_LOCALE = 'en';
const LOCALE_EXTENSION = '.json';
const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
function flatten(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value, path));
    } else {
      result[path] = value;
    }
  }
  return result;
}
function loadLocale(code) {
  const filePath = join(LOCALES_DIR, `${code}${LOCALE_EXTENSION}`);
  const raw = readFileSync(filePath, 'utf-8');
  return flatten(JSON.parse(raw));
}
function checkSnakeCase(keys) {
  const violations = [];
  for (const fullKey of keys) {
    const segments = fullKey.split('.');
    for (const seg of segments) {
      if (!SNAKE_CASE_RE.test(seg)) {
        violations.push({ key: fullKey, segment: seg });
        break;
      }
    }
  }
  return violations;
}
function main() {
  const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith(LOCALE_EXTENSION));
  const localeCodes = files.map((f) => f.replace(LOCALE_EXTENSION, ''));
  if (!localeCodes.includes(SOURCE_LOCALE)) {
    console.error(`Source locale "${SOURCE_LOCALE}${LOCALE_EXTENSION}" not found in ${LOCALES_DIR}`);
    process.exit(1);
  }
  const locales = {};
  for (const code of localeCodes) {
    locales[code] = loadLocale(code);
  }
  const sourceKeys = new Set(Object.keys(locales[SOURCE_LOCALE]));
  const targetCodes = localeCodes.filter((c) => c !== SOURCE_LOCALE).sort();
  let totalMissing = 0;
  let totalExtra = 0;
  const caseViolations = checkSnakeCase([...sourceKeys]);
  if (caseViolations.length > 0) {
    console.log(
      `\nKey naming violations in ${SOURCE_LOCALE}${LOCALE_EXTENSION} (expected snake_case):\n`
    );
    for (const { key, segment } of caseViolations) {
      console.log(`  ${key}  (segment: "${segment}")`);
    }
  }
  for (const code of targetCodes) {
    const targetKeys = new Set(Object.keys(locales[code]));
    const missing = [...sourceKeys].filter((k) => !targetKeys.has(k)).sort();
    const extra = [...targetKeys].filter((k) => !sourceKeys.has(k)).sort();
    if (missing.length === 0 && extra.length === 0) {
      continue;
    }
    console.log(`\n${code}${LOCALE_EXTENSION}:`);
    if (missing.length > 0) {
      totalMissing += missing.length;
      console.log(
        `  Missing ${missing.length} key(s) (will fall back to ${SOURCE_LOCALE} at runtime):`
      );
      for (const k of missing) {
        console.log(`    - ${k}`);
      }
    }
    if (extra.length > 0) {
      totalExtra += extra.length;
      console.log(`  Extra ${extra.length} key(s) not in ${SOURCE_LOCALE}:`);
      for (const k of extra) {
        console.log(`    + ${k}`);
      }
    }
  }
  console.log('');
  if (caseViolations.length > 0) {
    console.log(
      `i18n check: ${caseViolations.length} naming violation(s) in ${SOURCE_LOCALE}${LOCALE_EXTENSION}`
    );
    process.exit(1);
  }
  const informational = [];
  if (totalMissing > 0) {
    informational.push(`${totalMissing} missing (fallback to ${SOURCE_LOCALE} at runtime)`);
  }
  if (totalExtra > 0) {
    informational.push(`${totalExtra} extra (Crowdin will reconcile on next sync)`);
  }
  if (informational.length > 0) {
    console.log(`i18n check: ${informational.join(', ')} — non-fatal`);
  } else {
    console.log(
      `All ${targetCodes.length} locale(s) are in sync with ${SOURCE_LOCALE}${LOCALE_EXTENSION}`
    );
  }
  process.exit(0);
}
main();
