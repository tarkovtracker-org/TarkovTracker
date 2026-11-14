// Install before importing Nitro: ofetch captures the global fetch during module evaluation.
const identity = { version: 'head-test', sha256: 'a'.repeat(64) };
globalThis.fetch = async (input) => {
  const url = new URL(input.url ?? input);
  if (url.hostname === 'raw.githubusercontent.com') {
    return Response.json({
      $meta: { ...identity, generated: new Date().toISOString() },
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
  if (url.hostname === 'json.tarkov.dev') {
    return Response.json({
      data: { items: {}, playerLevels: [], tasks: {}, maps: {}, traders: {}, hideout: {} },
    });
  }
  throw new Error(`Unexpected compiled-test outbound request: ${url}`);
};
export const tarkovHeadKv = {
  async get(key, type) {
    if (key === 'overlay-precompute-manifest-json-v3') return { testManifest: true };
    const catalogPrefixes = ['tasks-core-json-v3-en-', 'tasks-import-json-v1-en-'];
    const prefix = catalogPrefixes.find((candidate) => key.startsWith(candidate));
    if (!prefix) throw new Error(`Unexpected compiled-test KV key: ${key}`);
    const gameMode = key.slice(prefix.length);
    const payload = {
      data: {
        tasks: [{ id: 'head-test-task', objectives: [], failConditions: [] }],
        maps: [],
        traders: [],
      },
      dataOverlay: { ...identity, status: 'fresh', unconsumedSections: [] },
      catalog: { lang: 'en', gameMode },
    };
    const envelope = { payload, overlay: identity, storedAt: Date.now(), version: 2 };
    return type === 'text' ? JSON.stringify(envelope) : envelope;
  },
};
