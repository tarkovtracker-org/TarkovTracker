#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const LOCALES_DIR = join(process.cwd(), 'app', 'locales');
const SOURCE_LOCALE = 'en';
const LOCALE_EXTENSION = '.json';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function alignWithSource(sourceValue, targetValue) {
  if (isObject(sourceValue)) {
    const sourceObject = sourceValue;
    const targetObject = isObject(targetValue) ? targetValue : {};
    const aligned = {};

    for (const key of Object.keys(sourceObject)) {
      aligned[key] = alignWithSource(sourceObject[key], targetObject[key]);
    }

    return aligned;
  }

  if (targetValue === undefined) {
    return sourceValue;
  }

  if (isObject(targetValue) || Array.isArray(targetValue)) {
    return sourceValue;
  }

  return targetValue;
}

function readLocaleRaw(code) {
  const filePath = join(LOCALES_DIR, `${code}${LOCALE_EXTENSION}`);
  return readFileSync(filePath, 'utf-8');
}

function parseLocale(raw) {
  return JSON.parse(raw);
}

function stringifyLocale(localeObject) {
  return `${JSON.stringify(localeObject, null, 2)}\n`;
}

function buildSyncedLocaleContent(sourceLocale, targetRaw) {
  const targetLocale = parseLocale(targetRaw);
  const aligned = alignWithSource(sourceLocale, targetLocale);
  return stringifyLocale(aligned);
}

function countLeaves(value) {
  if (isObject(value)) {
    return Object.values(value).reduce((sum, entry) => sum + countLeaves(entry), 0);
  }
  return 1;
}

function main() {
  const localeFiles = readdirSync(LOCALES_DIR).filter((file) => file.endsWith(LOCALE_EXTENSION));
  const localeCodes = localeFiles.map((file) => file.replace(LOCALE_EXTENSION, ''));

  if (!localeCodes.includes(SOURCE_LOCALE)) {
    console.error(`Source locale "${SOURCE_LOCALE}${LOCALE_EXTENSION}" not found in ${LOCALES_DIR}`);
    process.exit(1);
  }

  const sourceRaw = readLocaleRaw(SOURCE_LOCALE);
  const sourceLocale = parseLocale(sourceRaw);
  const sourceLeafCount = countLeaves(sourceLocale);
  const targetCodes = localeCodes.filter((code) => code !== SOURCE_LOCALE).sort();

  for (const code of targetCodes) {
    const targetRaw = readLocaleRaw(code);
    const nextContent = buildSyncedLocaleContent(sourceLocale, targetRaw);
    const secondPassContent = buildSyncedLocaleContent(sourceLocale, nextContent);

    if (nextContent !== secondPassContent) {
      console.error(`Sync output for ${code}${LOCALE_EXTENSION} is not idempotent`);
      process.exit(1);
    }

    writeFileSync(join(LOCALES_DIR, `${code}${LOCALE_EXTENSION}`), nextContent, 'utf-8');
  }

  console.log(
    `Synced ${targetCodes.length} locale(s) to ${SOURCE_LOCALE}${LOCALE_EXTENSION} structure (${sourceLeafCount} keys).`
  );
}

main();
