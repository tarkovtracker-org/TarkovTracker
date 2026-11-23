import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
const identity = { version: 'head-test', sha256: 'a'.repeat(64) };
const generated = '2026-01-01T00:00:00.000Z';
const modes = ['regular', 'pve', 'pvp-season'];
const languages = ['cs', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pl', 'pt', 'ru', 'tr', 'zh'];
const reference = (mode, endpoint, key) => `@tt:${mode}:${endpoint}:${key}`;
const task = (mode) => ({ id: 'head-test-task', name: reference(mode, 'tasks', 'name') });
const objective = (mode) => ({
  id: 'head-objective',
  description: reference(mode, 'tasks', 'head-objective'),
});
const item = (mode) => ({ id: 'head-item', name: reference(mode, 'items', 'name') });
const datasetData = {
  bootstrap: () => ({ playerLevels: [{ level: 1, exp: 0 }] }),
  'tasks-core': (mode) => ({ tasks: [task(mode)], maps: [], traders: [] }),
  'tasks-objectives': (mode) => ({
    tasks: [{ ...task(mode), objectives: [objective(mode)], failConditions: [] }],
  }),
  'tasks-rewards': (mode) => ({
    tasks: [{ ...task(mode), startRewards: { items: [item(mode)] } }],
  }),
  hideout: (mode) => ({
    hideoutStations: [{ id: 'head-station', name: reference(mode, 'hideout', 'name'), levels: [] }],
  }),
  'items-lite': (mode) => ({ items: [item(mode)] }),
  // An ordinary multi-chunk item catalog proves HEAD validation is not only first-chunk work.
  items: (mode) => ({
    items: Array.from({ length: 1200 }, (_, index) => ({
      ...item(mode),
      id: `head-item-${index}`,
    })),
  }),
  prestige: (mode) => ({
    prestige: [{ id: 'head-prestige', name: reference(mode, 'tasks', 'prestige') }],
  }),
  editions: (mode) => ({
    editions: [{ id: 'standard', title: reference(mode, 'tasks', 'edition') }],
    storyChapters: [
      { id: 'head-chapter', name: reference(mode, 'tasks', 'chapter'), objectives: [] },
    ],
    seasonalPerks: [],
  }),
  'map-spawns': () => ({ maps: [{ id: 'head-map', spawns: [] }] }),
};
const overlay = { ...identity, generated, status: 'fresh', unconsumedSections: [] };
const overlayHeaders = {
  'X-Overlay-Version': identity.version,
  'X-Overlay-Sha256': identity.sha256,
  'X-Overlay-Generated': generated,
  'X-Overlay-Status': 'fresh',
};
const manifest = { completedAt: 0, overlaySha: identity.sha256, entries: {} };
const bodies = new Map();
function stage(scope, data, usesOverlay = true) {
  const body = JSON.stringify({ data, ...(usesOverlay ? { dataOverlay: overlay } : {}) });
  const digest = createHash('sha256').update(body).digest('hex');
  const key = `neutral-catalog-v1/${scope}/${digest}`;
  bodies.set(key, gzipSync(body));
  manifest.entries[scope] = {
    key,
    bytes: Buffer.byteLength(body),
    headers: usesOverlay ? overlayHeaders : {},
  };
}
for (const mode of modes) {
  for (const [dataset, build] of Object.entries(datasetData))
    stage(`${dataset}/${mode}`, build(mode), !['bootstrap', 'map-spawns'].includes(dataset));
}
function objectiveText(lang, mode) {
  if (lang !== 'de') return `${mode} objective in English`;
  return mode === 'regular' ? 'Prestige 1 dogtag' : 'Level 20 dogtag';
}
for (const lang of languages) {
  const strings = {};
  for (const mode of modes) {
    for (const [endpoint, key] of [
      ['tasks', 'name'],
      ['tasks', 'prestige'],
      ['tasks', 'edition'],
      ['tasks', 'chapter'],
      ['items', 'name'],
      ['hideout', 'name'],
    ])
      strings[reference(mode, endpoint, key)] = `${lang} ${mode} ${endpoint} ${key}`;
    strings[reference(mode, 'tasks', 'head-objective')] = objectiveText(lang, mode);
  }
  stage(`strings/${lang}`, { strings });
}
export const tarkovHeadScopes = Object.keys(manifest.entries);
export const tarkovHeadOutbound = { reads: 0, redirectSeasonPreview: false };
function currentManifest() {
  if (!manifest.completedAt) manifest.completedAt = Date.now();
  return manifest;
}
function snapshotStream(key, type) {
  const bytes = bodies.get(key);
  if (!bytes || type !== 'stream')
    throw new Error(`Unexpected compiled-test KV key or read type: ${key} (${type})`);
  return new Response(bytes).body;
}
function importSnapshot(key, type) {
  const gameMode = key.slice('tasks-import-json-v1-en-'.length);
  if (!modes.includes(gameMode)) throw new Error(`Unexpected import fixture mode ${gameMode}`);
  const payload = {
    data: { tasks: [{ id: 'head-test-task', objectives: [], failConditions: [] }] },
    dataOverlay: overlay,
    catalog: { lang: 'en', gameMode },
  };
  const envelope = { payload, overlay: identity, storedAt: Date.now(), version: 2 };
  return type === 'text' ? JSON.stringify(envelope) : envelope;
}
export const tarkovHeadKv = {
  async get(key, type) {
    if (key === 'neutral-catalog-v1-manifest') return currentManifest();
    if (key.startsWith('tasks-import-json-v1-en-')) return importSnapshot(key, type);
    return snapshotStream(key, type);
  },
};
const seasonId = 'preview:untar-control';
const previewPerk = (id, points) => ({
  id: `${seasonId}:${id}`,
  name: `${seasonId}:${id} name`,
  description: `${seasonId}:${id} description`,
  points,
  exclusiveToPerks: [],
  imageLink: null,
});
const previewCommon = [previewPerk('global', null)];
const previewPersonal = [previewPerk('perk', -2), previewPerk('drawback', 2)];
function seasonPreviewResponse(url, options) {
  const pinned =
    'https://raw.githubusercontent.com/tarkovtracker-org/tarkov-data-overlay/a749270dcad82b26334ccf6feb15b8f4a66ff145/src/previews/untar-control.json';
  const request = new Request(url.href, options);
  if (
    ![
      request.url === pinned,
      request.headers.get('Authorization') === 'Bearer compiled-season-fixture-token',
      request.redirect === 'manual',
    ].every(Boolean)
  )
    throw new Error('Season preview must use scoped authorization and reject redirects');
  if (tarkovHeadOutbound.redirectSeasonPreview)
    return Response.redirect('https://example.invalid/redirected-catalog', 302);
  return Response.json({
    provisional: true,
    source: 'https://t.me/escapefromtarkovEN/7003',
    season: {
      data: {
        id: seasonId,
        name: `${seasonId} name`,
        start: null,
        end: null,
        perks: { common: previewCommon, personal: previewPersonal },
      },
      translations: ['$.data.name', '$.data.perks.*.*.name', '$.data.perks.*.*.description'],
    },
    season_en: {
      data: {
        [`${seasonId} name`]: 'UNTAR fixture',
        ...Object.fromEntries(
          [...previewCommon, ...previewPersonal].flatMap((perk) => [
            [perk.name, 'Modifier'],
            [perk.description, 'Effect'],
          ])
        ),
      },
    },
  });
}
// Install before importing Nitro: ofetch captures global fetch during module evaluation.
globalThis.fetch = async (input, options) => {
  tarkovHeadOutbound.reads++;
  const url = new URL(input.url ?? input);
  if (url.pathname.endsWith('/src/previews/untar-control.json')) {
    return seasonPreviewResponse(url, options);
  }
  if (url.hostname === 'raw.githubusercontent.com') {
    return Response.json({
      $meta: { ...identity, generated },
      editions: {
        standard: {
          title: 'Standard',
          value: 1,
          defaultStashLevel: 1,
          defaultCultistCircleLevel: 0,
          traderRepBonus: {},
        },
      },
    });
  }
  throw new Error(`Unexpected compiled-test outbound request: ${url}`);
};
