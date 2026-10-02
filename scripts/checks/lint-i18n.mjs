#!/usr/bin/env node
import { baseCompile } from '@intlify/message-compiler';
import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
const ROOT = process.cwd();
const APP_DIR = join(ROOT, 'app');
const LOCALES_DIR = join(APP_DIR, 'locales');
const LOCALES_UTILS_PATH = join(APP_DIR, 'utils', 'locales.ts');
const SOURCE_LOCALE = 'en';
const LOCALE_EXTENSION = '.json';
const SOURCE_FILE_RE = /\.(vue|ts|tsx|js|mjs)$/;
const SKIPPED_SOURCE_PATH_RE = /(^|\/)(__tests__|locales)(\/|$)|\.test\.[a-z]+$/;
const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const PLACEHOLDER_RE = /\{\s*([\w.]+)\s*\}/g;
function loadEnabledLocales() {
  const raw = readFileSync(LOCALES_UTILS_PATH, 'utf-8');
  const match = raw.match(/SUPPORTED_LOCALES\s*=\s*\[([\s\S]*?)\]/);
  const codes = match ? [...match[1].matchAll(/'([a-z0-9-]+)'/gi)].map((m) => m[1]) : [];
  if (codes.length === 0) {
    throw new Error(`Could not parse SUPPORTED_LOCALES in ${LOCALES_UTILS_PATH}`);
  }
  return codes;
}
function isNestedObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function flatten(obj, prefix = '', result = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isNestedObject(value)) {
      flatten(value, path, result);
    } else {
      result[path] = value;
    }
  }
  return result;
}
function loadLocale(code, errors) {
  try {
    return flatten(
      JSON.parse(readFileSync(join(LOCALES_DIR, `${code}${LOCALE_EXTENSION}`), 'utf-8'))
    );
  } catch (error) {
    errors.push(`${code}${LOCALE_EXTENSION}: invalid JSON (${error.message})`);
    return null;
  }
}
function readLocales(errors) {
  const codes = readdirSync(LOCALES_DIR)
    .filter((file) => file.endsWith(LOCALE_EXTENSION))
    .map((file) => file.slice(0, -LOCALE_EXTENSION.length))
    .sort();
  const locales = {};
  for (const code of codes) {
    locales[code] = loadLocale(code, errors);
  }
  return locales;
}
function assertSupportedLocales(locales, enabledLocales) {
  const missing = enabledLocales.filter((code) => !Object.hasOwn(locales, code));
  if (missing.length > 0) {
    const filenames = missing.map((code) => `${code}${LOCALE_EXTENSION}`).join(', ');
    throw new Error(`Missing supported locale file(s): ${filenames}`);
  }
}
function checkSnakeCase(sourceKeys, errors) {
  for (const key of sourceKeys) {
    const segment = key.split('.').find((part) => !SNAKE_CASE_RE.test(part));
    if (segment !== undefined) {
      errors.push(`${SOURCE_LOCALE}${LOCALE_EXTENSION}: ${key} is not snake_case ("${segment}")`);
    }
  }
}
function placeholdersOf(message) {
  return new Set([...String(message).matchAll(PLACEHOLDER_RE)].map((match) => match[1]));
}
function syntaxError(message) {
  let error = null;
  baseCompile(message, {
    onError: (compileError) => {
      error ??= compileError;
    },
  });
  return error;
}
function groupsOf(keys) {
  return new Set(
    keys.flatMap((key) =>
      key
        .split('.')
        .slice(0, -1)
        .map((_, i, parts) => parts.slice(0, i + 1).join('.'))
    )
  );
}
function structureError(key, reference) {
  const parent = key.split('.').slice(0, -1).join('.');
  if (reference.groups.has(key)) {
    return `${key} is a message but ${SOURCE_LOCALE} has a group of keys there`;
  }
  return parent && Object.hasOwn(reference.messages, parent)
    ? `${key} nests under ${parent}, which is a message in ${SOURCE_LOCALE}`
    : null;
}
function typeError(key, value, reference) {
  const expected = reference.messages[key];
  return expected !== undefined && typeof value !== typeof expected
    ? `${key} is a ${typeof value} but ${SOURCE_LOCALE} has a ${typeof expected}`
    : null;
}
function shapeError(key, value, reference) {
  return structureError(key, reference) ?? typeError(key, value, reference);
}
function placeholderError(key, value, reference) {
  const sourceMessage = reference.messages[key];
  if (typeof sourceMessage !== 'string') {
    return null;
  }
  const expected = placeholdersOf(sourceMessage);
  const unknown = [...placeholdersOf(value)].filter((name) => !expected.has(name));
  return unknown.length > 0 ? `${key} uses unknown placeholder(s) {${unknown.join('}, {')}}` : null;
}
function messageErrors(key, value, reference) {
  const shape = shapeError(key, value, reference);
  if (shape || typeof value !== 'string') {
    return [shape].filter(Boolean);
  }
  const syntax = syntaxError(value);
  const errors = syntax ? [`${key} has invalid message syntax: ${syntax.message}`] : [];
  return [...errors, placeholderError(key, value, reference)].filter(Boolean);
}
function checkLocale(code, messages, reference, errors) {
  for (const [key, value] of Object.entries(messages)) {
    for (const error of messageErrors(key, value, reference)) {
      errors.push(`${code}${LOCALE_EXTENSION}: ${error}`);
    }
  }
}
function listSourceFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && SOURCE_FILE_RE.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !SKIPPED_SOURCE_PATH_RE.test(relative(dir, path)));
}
function readSource() {
  return listSourceFiles(APP_DIR)
    .map((path) => readFileSync(path, 'utf-8'))
    .join('\n');
}
function hasDynamicParent(parts, source) {
  for (let length = parts.length - 1; length > 0; length -= 1) {
    const parent = parts.slice(0, length).join('.');
    if (source.includes(`${parent}.\${`) || source.includes(`'${parent}'`)) {
      return true;
    }
  }
  return false;
}
function mayBeReferenced(key, source) {
  const parts = key.split('.');
  const leaf = parts.at(-1);
  if (source.includes(key) || source.includes(`'${leaf}'`) || source.includes(`${leaf}:`)) {
    return true;
  }
  return hasDynamicParent(parts, source);
}
function checkUnusedKeys(sourceKeys, errors) {
  const source = readSource();
  for (const key of sourceKeys) {
    if (!mayBeReferenced(key, source)) {
      errors.push(`${SOURCE_LOCALE}${LOCALE_EXTENSION}: ${key} is not used in app/; remove it`);
    }
  }
}
function checkSource(source, errors) {
  const sourceKeys = Object.keys(source);
  checkSnakeCase(sourceKeys, errors);
  checkUnusedKeys(sourceKeys, errors);
  return { messages: source, groups: groupsOf(sourceKeys) };
}
function collectErrors() {
  const errors = [];
  const locales = readLocales(errors);
  assertSupportedLocales(locales, loadEnabledLocales());
  const source = locales[SOURCE_LOCALE];
  if (!source) {
    return errors.length > 0 ? errors : [`${SOURCE_LOCALE}${LOCALE_EXTENSION} not found`];
  }
  const reference = checkSource(source, errors);
  for (const [code, messages] of Object.entries(locales).filter(([, value]) => value)) {
    checkLocale(code, messages, reference, errors);
  }
  return errors;
}
function main() {
  const errors = collectErrors();
  if (errors.length > 0) {
    console.error(errors.map((error) => `  - ${error}`).join('\n'));
    console.error(`\ni18n check: ${errors.length} problem(s)`);
    process.exit(1);
  }
  console.log('i18n check: all locales are valid; untranslated keys fall back to en');
}
main();
