import { isDeepStrictEqual } from 'node:util';
import v8 from '@vitest/coverage-v8';
const REQUIRED_METHODS = [
  'createCoverageMap',
  'isIncluded',
  'getCoverageMapForUncoveredFiles',
  'generateReports',
];
const MAP_KEYS = ['statementMap', 'fnMap', 'branchMap'];
const sameShape = (a, b) => MAP_KEYS.every((key) => isDeepStrictEqual(a[key], b[key]));
const sumHits = (a, b) =>
  Object.fromEntries(
    Object.entries(a).map(([id, hits]) => [
      id,
      Array.isArray(hits) ? hits.map((count, i) => count + b[id][i]) : hits + b[id],
    ])
  );
// istanbul keys merged items by source location, which collapses distinct Vue
// template branches that share one. Shards transform each file identically, so
// sum hits positionally and fall back to istanbul only when the maps differ.
const sumFileHits = (target, source) => {
  const summed = { ...target, s: sumHits(target.s, source.s), f: sumHits(target.f, source.f) };
  summed.b = sumHits(target.b, source.b);
  if (target.bT && source.bT) summed.bT = sumHits(target.bT, source.bT);
  return summed;
};
const locationMerge = (createCoverageMap, file, target, source) => {
  const map = createCoverageMap();
  map.merge({ [file]: target });
  map.merge({ [file]: source });
  return map.fileCoverageFor(file).toJSON();
};
const mergeFile = (createCoverageMap, file, target, source) => {
  if (!target) return source;
  if (sameShape(target, source)) return sumFileHits(target, source);
  return locationMerge(createCoverageMap, file, target, source);
};
const unwrap = (coverage) => coverage.data ?? coverage;
const fileEntries = (shardMaps) => shardMaps.flatMap((shard) => Object.entries(unwrap(shard)));
export function mergeShardCoverage(createCoverageMap, shardMaps) {
  const merged = {};
  for (const [file, raw] of fileEntries(shardMaps)) {
    merged[file] = mergeFile(createCoverageMap, file, merged[file], structuredClone(unwrap(raw)));
  }
  const coverageMap = createCoverageMap();
  coverageMap.merge(merged);
  return coverageMap;
}
// `vitest --merge-reports` only unions shard maps. Apply the include filter and
// zero-fill never-imported files so the merged denominator matches an unsharded run.
export default {
  ...v8,
  async getProvider() {
    const provider = await v8.getProvider();
    const missing = REQUIRED_METHODS.filter((method) => typeof provider[method] !== 'function');
    if (missing.length) {
      throw new TypeError(
        `@vitest/coverage-v8 no longer exposes ${missing.join(', ')}; update ${import.meta.url}`
      );
    }
    provider.mergeReports = async function mergeReports(shardMaps) {
      const coverageMap = mergeShardCoverage(() => this.createCoverageMap(), shardMaps);
      coverageMap.filter((file) => this.isIncluded(file));
      const covered = new Set(coverageMap.files());
      // Vitest passes covered paths to its glob as ignore patterns, so names like
      // `[...path].ts` would be zero-filled on top of their real coverage.
      const uncovered = await this.getCoverageMapForUncoveredFiles([...covered]);
      uncovered.filter((file) => !covered.has(file));
      coverageMap.merge(uncovered);
      await this.generateReports(coverageMap, true);
    };
    return provider;
  },
};
