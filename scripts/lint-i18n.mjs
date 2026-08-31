#!/usr/bin/env node
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
const LOCALES_DIR = join(process.cwd(), 'app', 'locales');
const LOCALES_UTILS_PATH = join(process.cwd(), 'app', 'utils', 'locales.ts');
const SOURCE_LOCALE = 'en';
const LOCALE_EXTENSION = '.json';
const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const ENABLED_UNTRANSLATED_PERCENT = 90;
const DISABLED_TRANSLATED_PERCENT = 30;
function loadEnabledLocales() {
  const raw = readFileSync(LOCALES_UTILS_PATH, 'utf-8');
  const match = raw.match(/SUPPORTED_LOCALES\s*=\s*\[([\s\S]*?)\]/);
  const codes = match ? [...match[1].matchAll(/'([a-z0-9-]+)'/gi)].map((m) => m[1]) : [];
  if (!match || codes.length === 0) {
    console.warn(`i18n check: could not parse SUPPORTED_LOCALES in ${LOCALES_UTILS_PATH}`);
    return null;
  }
  return new Set(codes);
}
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
function readLocaleFiles() {
  const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith(LOCALE_EXTENSION));
  const localeCodes = files.map((f) => f.replace(LOCALE_EXTENSION, ''));
  if (!localeCodes.includes(SOURCE_LOCALE)) {
    console.error(
      `Source locale "${SOURCE_LOCALE}${LOCALE_EXTENSION}" not found in ${LOCALES_DIR}`
    );
    process.exit(1);
  }
  const locales = {};
  for (const code of localeCodes) {
    locales[code] = loadLocale(code);
  }
  return { locales, targetCodes: localeCodes.filter((c) => c !== SOURCE_LOCALE).sort() };
}
function reportCaseViolations(keys) {
  const violations = checkSnakeCase(keys);
  if (violations.length > 0) {
    console.log(
      `\nKey naming violations in ${SOURCE_LOCALE}${LOCALE_EXTENSION} (expected snake_case):\n`
    );
    for (const { key, segment } of violations) {
      console.log(`  ${key}  (segment: "${segment}")`);
    }
  }
  return violations.length;
}
function keySyncFor(locales, sourceKeys, code) {
  const targetKeys = new Set(Object.keys(locales[code]));
  const missing = [...sourceKeys].filter((k) => !targetKeys.has(k)).sort();
  const extra = [...targetKeys].filter((k) => !sourceKeys.has(k)).sort();
  return { missing, extra };
}
function printMissing(code, missing) {
  if (missing.length === 0) {
    return;
  }
  console.log(`\n${code}${LOCALE_EXTENSION}:`);
  console.log(
    `  Missing ${missing.length} key(s) (will fall back to ${SOURCE_LOCALE} at runtime):`
  );
  for (const k of missing) {
    console.log(`    - ${k}`);
  }
}
function printExtra(code, extra, withHeader) {
  if (extra.length === 0) {
    return;
  }
  if (withHeader) {
    console.log(`\n${code}${LOCALE_EXTENSION}:`);
  }
  console.log(`  Extra ${extra.length} key(s) not in ${SOURCE_LOCALE}:`);
  for (const k of extra) {
    console.log(`    + ${k}`);
  }
}
function reportKeySync(locales, sourceKeys, targetCodes) {
  let totalMissing = 0;
  let totalExtra = 0;
  for (const code of targetCodes) {
    const { missing, extra } = keySyncFor(locales, sourceKeys, code);
    printMissing(code, missing);
    printExtra(code, extra, missing.length === 0);
    totalMissing += missing.length;
    totalExtra += extra.length;
  }
  return { totalMissing, totalExtra };
}
function englishIdentityPercent(sourceValues, targetValues, sourceKeys) {
  const merged = { ...sourceValues, ...targetValues };
  let identical = 0;
  for (const key of sourceKeys) {
    if (merged[key] === sourceValues[key]) {
      identical += 1;
    }
  }
  return sourceKeys.size === 0 ? 0 : (identical / sourceKeys.size) * 100;
}
function enabledDriftWarning(code, percent) {
  if (percent > ENABLED_UNTRANSLATED_PERCENT) {
    return (
      `${code}: enabled but ${percent.toFixed(1)}% of values identical to ${SOURCE_LOCALE} ` +
      `(warn threshold ${ENABLED_UNTRANSLATED_PERCENT}%)`
    );
  }
  return null;
}
function disabledDriftWarning(code, percent) {
  if (percent < DISABLED_TRANSLATED_PERCENT) {
    return (
      `${code}: translated (only ${percent.toFixed(1)}% identical to ${SOURCE_LOCALE}) ` +
      `but not in SUPPORTED_LOCALES`
    );
  }
  return null;
}
function driftWarningFor(code, percent, enabled) {
  return enabled ? enabledDriftWarning(code, percent) : disabledDriftWarning(code, percent);
}
function localeDriftWarnings(locales, sourceValues, sourceKeys, targetCodes, enabledLocales) {
  if (!enabledLocales) {
    return [];
  }
  return targetCodes
    .map((code) => {
      const percent = englishIdentityPercent(sourceValues, locales[code], sourceKeys);
      return driftWarningFor(code, percent, enabledLocales.has(code));
    })
    .filter((warning) => warning !== null);
}
function printDriftWarnings(warnings) {
  if (warnings.length === 0) {
    return;
  }
  console.log(`\nLocale drift warnings (non-fatal):`);
  for (const warning of warnings) {
    console.log(`  - ${warning}`);
  }
}
function buildSummaryParts(totalMissing, totalExtra, warningCount) {
  const parts = [];
  if (totalMissing > 0) {
    parts.push(`${totalMissing} missing (fallback to ${SOURCE_LOCALE} at runtime)`);
  }
  if (totalExtra > 0) {
    parts.push(`${totalExtra} extra (Crowdin will reconcile on next sync)`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} locale drift warning(s)`);
  }
  return parts;
}
function summarize(parts, targetCount) {
  console.log('');
  if (parts.length > 0) {
    console.log(`i18n check: ${parts.join(', ')} — non-fatal`);
    return;
  }
  console.log(`All ${targetCount} locale(s) are in sync with ${SOURCE_LOCALE}${LOCALE_EXTENSION}`);
}
function main() {
  const { locales, targetCodes } = readLocaleFiles();
  const sourceKeys = new Set(Object.keys(locales[SOURCE_LOCALE]));
  const sourceValues = locales[SOURCE_LOCALE];
  const enabledLocales = loadEnabledLocales();
  const caseViolationCount = reportCaseViolations([...sourceKeys]);
  if (caseViolationCount > 0) {
    console.log(
      `i18n check: ${caseViolationCount} naming violation(s) in ${SOURCE_LOCALE}${LOCALE_EXTENSION}`
    );
    process.exit(1);
  }
  const { totalMissing, totalExtra } = reportKeySync(locales, sourceKeys, targetCodes);
  const warnings = localeDriftWarnings(
    locales,
    sourceValues,
    sourceKeys,
    targetCodes,
    enabledLocales
  );
  printDriftWarnings(warnings);
  summarize(buildSummaryParts(totalMissing, totalExtra, warnings.length), targetCodes.length);
  process.exit(0);
}
main();
