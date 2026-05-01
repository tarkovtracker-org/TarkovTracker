#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
const LOCALES_DIR = join(process.cwd(), 'app', 'locales');
const SOURCE_LOCALE = 'en';
const LOCALE_EXTENSION = '.json';
const TARGETS = ['de', 'es', 'fr', 'ru', 'uk', 'zh'];
const TARGET_CODE_MAP = {
  zh: 'zh-CN',
};
const PROTECTED_TERMS = [
  'Tarkov Tracker',
  'Escape from Tarkov',
  'Tarkov',
  'tarkov.dev',
  'Supabase',
  'JSON',
  'API',
  'REST',
  'PvP',
  'PvE',
  'PMC',
  'Scav',
  'Kappa',
  'Lightkeeper',
  'FIR',
];
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const REQUEST_DELAY_MS = 120;
const CONCURRENCY = 3;
const cache = new Map();
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function flatten(obj, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isObject(value)) {
      Object.assign(out, flatten(value, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}
function rebuildFromSource(source, flat, prefix = '') {
  if (isObject(source)) {
    const out = {};
    for (const [key, value] of Object.entries(source)) {
      const path = prefix ? `${prefix}.${key}` : key;
      out[key] = rebuildFromSource(value, flat, path);
    }
    return out;
  }
  return flat[prefix];
}
function stringifyLocale(localeObject) {
  return `${JSON.stringify(localeObject, null, 2)}\n`;
}
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function protectTokens(text) {
  const replacements = [];
  let counter = 0;
  const addReplacement = (value) => {
    const token = `TTX${counter}ZZ`;
    replacements.push([token, value]);
    counter += 1;
    return token;
  };
  let masked = text;
  masked = masked.replace(/\{[^{}]+\}/g, (match) => addReplacement(match));
  masked = masked.replace(/https?:\/\/\S+/g, (match) => addReplacement(match));
  const sortedTerms = [...PROTECTED_TERMS].sort((a, b) => b.length - a.length);
  for (const term of sortedTerms) {
    const pattern = new RegExp(escapeRegex(term), 'g');
    masked = masked.replace(pattern, (match) => addReplacement(match));
  }
  const restore = (value) => {
    let next = value;
    for (const [token, original] of replacements) {
      next = next.replaceAll(token, original);
    }
    return next;
  };
  return { masked, restore };
}
function shouldTranslate(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (!/[A-Za-z]/.test(trimmed)) {
    return false;
  }
  if (/^\{[^{}]+\}$/.test(trimmed)) {
    return false;
  }
  if (/^[A-Z0-9_./:+\s-]+$/.test(trimmed)) {
    return false;
  }
  return true;
}
async function translateRaw(text, targetLang) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'en');
  url.searchParams.set('tl', targetLang);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
        throw new Error('Unexpected response payload');
      }
      return payload[0].map((part) => part?.[0] ?? '').join('');
    } catch (error) {
      if (attempt === 5) {
        throw error;
      }
      await sleep(300 * attempt);
    }
  }
  throw new Error('Unreachable');
}
async function translateText(text, targetLang) {
  const cacheKey = `${targetLang}\u0000${text}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  const { masked, restore } = protectTokens(text);
  const translatedMasked = await translateRaw(masked, targetLang);
  const translated = restore(translatedMasked);
  cache.set(cacheKey, translated);
  return translated;
}
async function mapWithConcurrency(items, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) {
        return;
      }
      results[current] = await worker(items[current], current);
      await sleep(REQUEST_DELAY_MS);
    }
  }
  const tasks = [];
  const workers = Math.min(CONCURRENCY, items.length);
  for (let i = 0; i < workers; i += 1) {
    tasks.push(run());
  }
  await Promise.all(tasks);
  return results;
}
async function translateLocale(sourceLocale, localeCode) {
  const filePath = join(LOCALES_DIR, `${localeCode}${LOCALE_EXTENSION}`);
  const raw = readFileSync(filePath, 'utf-8');
  const locale = JSON.parse(raw);
  const sourceFlat = flatten(sourceLocale);
  const localeFlat = flatten(locale);
  const keys = Object.keys(sourceFlat);
  const candidates = keys.filter((key) => {
    const sourceValue = sourceFlat[key];
    const targetValue = localeFlat[key];
    return targetValue === sourceValue && shouldTranslate(sourceValue);
  });
  const lang = TARGET_CODE_MAP[localeCode] ?? localeCode;
  let done = 0;
  const failures = [];
  if (candidates.length > 0) {
    console.log(`${localeCode}: translating ${candidates.length} key(s)`);
  } else {
    console.log(`${localeCode}: no pending translations`);
  }
  await mapWithConcurrency(candidates, async (key) => {
    const sourceValue = sourceFlat[key];
    try {
      const translated = await translateText(sourceValue, lang);
      if (translated && translated.trim()) {
        localeFlat[key] = translated;
      }
    } catch {
      failures.push(key);
    }
    done += 1;
    if (done % 25 === 0 || done === candidates.length) {
      console.log(`${localeCode}: ${done}/${candidates.length}`);
    }
  });
  const rebuilt = rebuildFromSource(sourceLocale, localeFlat);
  const output = stringifyLocale(rebuilt);
  writeFileSync(filePath, output, 'utf-8');
  return {
    localeCode,
    translated: candidates.length - failures.length,
    failures,
  };
}
async function main() {
  const sourcePath = join(LOCALES_DIR, `${SOURCE_LOCALE}${LOCALE_EXTENSION}`);
  const sourceLocale = JSON.parse(readFileSync(sourcePath, 'utf-8'));
  const summary = [];
  for (const localeCode of TARGETS) {
    summary.push(await translateLocale(sourceLocale, localeCode));
  }
  let totalTranslated = 0;
  let totalFailed = 0;
  for (const item of summary) {
    totalTranslated += item.translated;
    totalFailed += item.failures.length;
  }
  console.log(`translated: ${totalTranslated}, failed: ${totalFailed}`);
  if (totalFailed > 0) {
    process.exit(1);
  }
}
main();
