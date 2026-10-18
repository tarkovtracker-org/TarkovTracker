import { describe, expect, it } from 'vitest';
import mergedCoverage, { mergeShardCoverage } from './vitest-merged-coverage.mjs';
const provider = await mergedCoverage.getProvider();
const createCoverageMap = () => provider.createCoverageMap();
const loc = (line, column = 0) => ({ start: { line, column }, end: { line, column: column + 5 } });
const fileCoverage = (
  path,
  {
    s = [0],
    b = [
      [0, 0],
      [0, 0],
    ],
    branchLines = [1, 1],
  } = {}
) => ({
  path,
  statementMap: Object.fromEntries(s.map((_, i) => [i, loc(i + 1)])),
  fnMap: {},
  branchMap: Object.fromEntries(
    b.map((hits, i) => [
      i,
      {
        loc: loc(branchLines[i]),
        type: 'if',
        locations: hits.map(() => loc(branchLines[i])),
        line: 1,
      },
    ])
  ),
  s: Object.fromEntries(s.map((hits, i) => [i, hits])),
  f: {},
  b: Object.fromEntries(b.map((hits, i) => [i, hits])),
});
const totals = (map, file) => map.fileCoverageFor(file).toSummary().data;
describe('merged shard coverage', () => {
  it('keeps same-location Vue branches distinct while summing shard hits', () => {
    const file = '/repo/app/Count.vue';
    const map = mergeShardCoverage(createCoverageMap, [
      {
        [file]: fileCoverage(file, {
          s: [1],
          b: [
            [1, 0],
            [0, 0],
          ],
        }),
      },
      {
        [file]: fileCoverage(file, {
          s: [0],
          b: [
            [0, 0],
            [0, 1],
          ],
        }),
      },
    ]);
    expect(map.fileCoverageFor(file).b).toEqual({ 0: [1, 0], 1: [0, 1] });
    expect(totals(map, file).branches).toMatchObject({ covered: 2, total: 4 });
    expect(totals(map, file).statements).toMatchObject({ covered: 1, total: 1 });
  });
  it('falls back to a location merge when shards transformed a file differently', () => {
    const file = '/repo/app/route.ts';
    const map = mergeShardCoverage(createCoverageMap, [
      { [file]: fileCoverage(file, { s: [1], b: [], branchLines: [] }) },
      { [file]: fileCoverage(file, { s: [0, 1], b: [], branchLines: [] }) },
    ]);
    expect(totals(map, file).statements).toMatchObject({ covered: 2, total: 2 });
  });
  it('zero-fills only included files that no shard covered', async () => {
    const covered = '/repo/app/[...path].get.ts';
    const untested = '/repo/app/login.vue';
    let reported;
    await provider.mergeReports.call(
      {
        createCoverageMap,
        isIncluded: (file) => file.startsWith('/repo/app/'),
        getCoverageMapForUncoveredFiles: async () => {
          const map = createCoverageMap();
          map.merge({
            [covered]: fileCoverage(covered, { s: [0, 0], b: [], branchLines: [] }),
            [untested]: fileCoverage(untested, { s: [0, 0, 0], b: [], branchLines: [] }),
          });
          return map;
        },
        generateReports: async (map) => {
          reported = map;
        },
      },
      [
        {
          [covered]: fileCoverage(covered, { s: [1], b: [], branchLines: [] }),
          '/repo/server/api.ts': fileCoverage('/repo/server/api.ts'),
        },
      ]
    );
    expect(reported.files().sort()).toEqual([covered, untested]);
    expect(totals(reported, covered).statements).toMatchObject({ covered: 1, total: 1 });
    expect(totals(reported, untested).statements).toMatchObject({ covered: 0, total: 3 });
  });
});
