#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import JSON5 from 'json5';

const LOCALES_DIR = join(process.cwd(), 'app', 'locales');
const SOURCE_LOCALE = 'en';

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
  const filePath = join(LOCALES_DIR, `${code}.json5`);
  return readFileSync(filePath, 'utf-8');
}

function parseLocale(raw) {
  return JSON5.parse(raw);
}

function normalizeKeyToken(keyToken) {
  const trimmed = keyToken.trim();
  return trimmed.replace(/^['"]|['"]$/g, '');
}

function isObjectLine(valuePortion) {
  return /^\{\s*$/.test(valuePortion.trim());
}

function extractCommentsByPath(raw) {
  const commentsByPath = new Map();
  const pendingComments = [];
  const stack = [];
  const lines = raw.split('\n');

  for (const line of lines) {
    const commentMatch = line.match(/^(\s*\/\/.*)$/);
    if (commentMatch) {
      pendingComments.push(commentMatch[1]);
      continue;
    }

    if (line.trim().length === 0) {
      if (pendingComments.length > 0) {
        pendingComments.push('');
      }
      continue;
    }

    const keyMatch = line.match(/^(\s*)(['"]?[\w-]+['"]?)\s*:\s*(.+)$/);
    if (!keyMatch) {
      if (!line.trim().startsWith('}')) {
        pendingComments.length = 0;
      }
      continue;
    }

    const indentation = keyMatch[1].length;
    const key = normalizeKeyToken(keyMatch[2]);
    const valuePortion = keyMatch[3];
    const depth = Math.max(0, Math.floor(indentation / 2) - 1);

    stack.length = depth;
    const path = [...stack, key].join('.');

    if (pendingComments.length > 0) {
      commentsByPath.set(path, [...pendingComments]);
      pendingComments.length = 0;
    }

    if (isObjectLine(valuePortion)) {
      stack.push(key);
    }
  }

  return commentsByPath;
}

function injectCommentsByPath(content, commentsByPath) {
  const lines = content.split('\n');
  const stack = [];
  const output = [];

  for (const line of lines) {
    const keyMatch = line.match(/^(\s*)(['"]?[\w-]+['"]?)\s*:\s*(.+)$/);
    if (!keyMatch) {
      output.push(line);
      continue;
    }

    const indentation = keyMatch[1].length;
    const key = normalizeKeyToken(keyMatch[2]);
    const valuePortion = keyMatch[3];
    const depth = Math.max(0, Math.floor(indentation / 2) - 1);

    stack.length = depth;
    const path = [...stack, key].join('.');
    const commentLines = commentsByPath.get(path) ?? [];

    if (commentLines.length > 0) {
      for (const commentLine of commentLines) {
        output.push(commentLine);
      }
    }

    output.push(line);

    if (isObjectLine(valuePortion)) {
      stack.push(key);
    }
  }

  return `${output.join('\n').replace(/\n+$/, '\n')}`;
}

function stringifyLocale(localeObject, commentsByPath) {
  const content = JSON5.stringify(localeObject, null, 2);
  return injectCommentsByPath(`${content}\n`, commentsByPath);
}

function buildSyncedLocaleContent(sourceLocale, targetRaw) {
  const targetLocale = parseLocale(targetRaw);
  const aligned = alignWithSource(sourceLocale, targetLocale);
  const commentsByPath = extractCommentsByPath(targetRaw);
  return stringifyLocale(aligned, commentsByPath);
}

function countLeaves(value) {
  if (isObject(value)) {
    return Object.values(value).reduce((sum, entry) => sum + countLeaves(entry), 0);
  }
  return 1;
}

function main() {
  const localeFiles = readdirSync(LOCALES_DIR).filter((file) => file.endsWith('.json5'));
  const localeCodes = localeFiles.map((file) => file.replace('.json5', ''));

  if (!localeCodes.includes(SOURCE_LOCALE)) {
    console.error(`Source locale "${SOURCE_LOCALE}.json5" not found in ${LOCALES_DIR}`);
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
      console.error(`Sync output for ${code}.json5 is not idempotent`);
      process.exit(1);
    }

    writeFileSync(join(LOCALES_DIR, `${code}.json5`), nextContent, 'utf-8');
  }

  console.log(
    `Synced ${targetCodes.length} locale(s) to ${SOURCE_LOCALE}.json5 structure (${sourceLeafCount} keys).`
  );
}

main();
