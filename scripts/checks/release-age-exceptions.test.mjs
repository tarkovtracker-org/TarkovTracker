import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  evaluateExceptions,
  inAdvisoryRange,
  parseEntry,
  parseWorkspacePolicy,
} from './release-age-exceptions.mjs';
const NOW = Date.parse('2026-10-22T00:00:00Z');
const daysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
const release = (overrides = {}) => ({
  _npmUser: { name: 'GitHub Actions' },
  dist: { attestations: { url: 'x' } },
  repository: { url: 'git+https://github.com/nuxt/nuxt.git' },
  ...overrides,
});
const packument = (name, versions) => ({
  name,
  versions: Object.fromEntries(
    Object.entries(versions).map(([version, [, manifest]]) => [version, manifest])
  ),
  time: Object.fromEntries(
    Object.entries(versions).map(([version, [age]]) => [version, daysAgo(age)])
  ),
});
const advisory = (name, range, patched) => ({
  ghsa_id: 'GHSA-test',
  vulnerabilities: [
    {
      package: { ecosystem: 'npm', name },
      vulnerable_version_range: range,
      first_patched_version: patched,
    },
  ],
});
const nuxt = packument('nuxt', { '4.6.1': [20, release()], '4.6.2': [2, release()] });
const kit = packument('@nuxt/kit', { '4.6.1': [20, release()], '4.6.2': [2, release()] });
const policy = (...excludes) => ({ minutes: 10080, excludes });
const lookup = {
  nuxt: { packument: nuxt, advisories: [advisory('nuxt', '>= 4.0.0, < 4.6.2', '4.6.2')] },
  '@nuxt/kit': { packument: kit, advisories: [] },
};
describe('version helpers', () => {
  it('orders releases and prereleases', () => {
    expect(compareVersions('4.6.2', '4.6.10')).toBe(-1);
    expect(compareVersions('4.6.2-rc.1', '4.6.2')).toBe(-1);
    expect(compareVersions('4.6.2', '4.6.2')).toBe(0);
  });
  it('matches GitHub advisory ranges', () => {
    expect(inAdvisoryRange('4.6.1', '>= 4.0.0, < 4.6.2')).toBe(true);
    expect(inAdvisoryRange('4.6.2', '>= 4.0.0, < 4.6.2')).toBe(false);
    expect(inAdvisoryRange('4.6.2', '= 4.6.2')).toBe(true);
  });
  it('parses scoped entries and rejects patterns', () => {
    expect(parseEntry('@nuxt/kit@4.6.2')).toEqual({ name: '@nuxt/kit', version: '4.6.2' });
    expect(parseEntry('@nuxt/*')).toEqual({ name: '@nuxt/*', version: undefined });
    expect(parseEntry('nuxt')).toEqual({ name: 'nuxt', version: undefined });
    expect(parseEntry('nuxt@4.6.1 || 4.6.2').version).toBeUndefined();
  });
  it('reads the workspace policy', () => {
    const text =
      "minimumReleaseAge: 10080\nminimumReleaseAgeExclude:\n  - nuxt@4.6.2\n  - '@nuxt/kit@4.6.2'\nother: 1\n";
    expect(parseWorkspacePolicy(text)).toEqual({
      minutes: 10080,
      excludes: ['nuxt@4.6.2', '@nuxt/kit@4.6.2'],
    });
  });
});
describe('evaluateExceptions', () => {
  it('accepts an advisory fix and its same-release companion', () => {
    const verdict = evaluateExceptions(policy('nuxt@4.6.2', '@nuxt/kit@4.6.2'), lookup, NOW);
    expect(verdict.failures).toEqual([]);
    expect(verdict.justified).toEqual([
      { entry: 'nuxt@4.6.2', reason: 'GHSA-test' },
      { entry: '@nuxt/kit@4.6.2', reason: 'companion of nuxt@4.6.2' },
    ]);
  });
  it('rejects a sibling release on a different version than the fix', () => {
    const drifted = packument('@nuxt/kit', { '4.6.1': [20, release()], '4.6.3': [2, release()] });
    const verdict = evaluateExceptions(
      policy('nuxt@4.6.2', '@nuxt/kit@4.6.3'),
      { ...lookup, '@nuxt/kit': { packument: drifted, advisories: [] } },
      NOW
    );
    expect(verdict.failures).toEqual([expect.stringContaining('@nuxt/kit@4.6.3 fixes no open')]);
  });
  it('rejects a young version that fixes no advisory', () => {
    const verdict = evaluateExceptions(policy('@nuxt/kit@4.6.2'), lookup, NOW);
    expect(verdict.failures).toEqual([expect.stringContaining('fixes no open advisory')]);
  });
});
describe('evaluateExceptions advisory matching', () => {
  it('rejects a fix when a patched release in the line has already matured', () => {
    const mature = packument('nuxt', {
      '4.6.1': [30, release()],
      '4.6.2': [20, release()],
      '4.6.3': [2, release()],
    });
    const verdict = evaluateExceptions(
      policy('nuxt@4.6.3'),
      { nuxt: { packument: mature, advisories: lookup.nuxt.advisories } },
      NOW
    );
    expect(verdict.failures).toEqual([expect.stringContaining('fixes no open advisory')]);
  });
  it('rejects a version still inside a vulnerable range or in another major line', () => {
    const verdict = evaluateExceptions(
      policy('nuxt@4.6.2'),
      { nuxt: { packument: nuxt, advisories: [advisory('nuxt', '>= 3.0.0, < 3.21.4', '3.21.4')] } },
      NOW
    );
    expect(verdict.failures).toEqual([expect.stringContaining('fixes no open advisory')]);
    const still = evaluateExceptions(
      policy('nuxt@4.6.2'),
      { nuxt: { packument: nuxt, advisories: [advisory('nuxt', '<= 4.6.2', '4.6.0')] } },
      NOW
    );
    expect(still.failures).toEqual([expect.stringContaining('fixes no open advisory')]);
  });
});
describe('evaluateExceptions screening', () => {
  it('fails vetting for missing provenance, a new publisher, or new install scripts', () => {
    const risky = packument('nuxt', {
      '4.6.1': [20, release()],
      '4.6.2': [
        2,
        release({ dist: {}, _npmUser: { name: 'someone' }, scripts: { postinstall: 'x' } }),
      ],
    });
    const verdict = evaluateExceptions(
      policy('nuxt@4.6.2'),
      { nuxt: { packument: risky, advisories: lookup.nuxt.advisories } },
      NOW
    );
    expect(verdict.failures).toEqual([
      'nuxt@4.6.2 has no npm provenance attestation',
      'nuxt@4.6.2 was published by someone, not GitHub Actions (previous release)',
      'nuxt@4.6.2 adds install scripts: postinstall',
    ]);
  });
  it('fails patterns and unverifiable entries, warns on matured ones', () => {
    const old = packument('nuxt', { '4.6.1': [30, release()], '4.6.2': [8, release()] });
    const verdict = evaluateExceptions(
      policy('@nuxt/*', 'missing@1.0.0', 'nuxt@4.6.2'),
      { nuxt: { packument: old, advisories: [] } },
      NOW
    );
    expect(verdict.failures).toEqual([
      expect.stringContaining('exempts every version'),
      expect.stringContaining('could not be verified'),
    ]);
    expect(verdict.warnings).toEqual([expect.stringContaining('past the release-age window')]);
  });
  it('fails excludes without a release-age policy', () => {
    expect(
      evaluateExceptions({ minutes: undefined, excludes: ['nuxt@4.6.2'] }, lookup, NOW).failures
    ).toEqual([expect.stringContaining('not set')]);
  });
});
