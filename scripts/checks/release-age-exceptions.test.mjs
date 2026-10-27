import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  evaluateExceptions,
  inAdvisoryRange,
  parseEntry,
  policyFromConfig,
} from './release-age-exceptions.mjs';
const NOW = Date.parse('2026-10-22T00:00:00Z');
const daysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
const release = (overrides = {}) => ({
  _npmUser: { name: 'GitHub Actions' },
  dist: { attestations: { url: 'x' } },
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
const NUXT_REPO = 'https://github.com/nuxt/nuxt';
const pkg = (pk, advisories = [], repository = NUXT_REPO) => ({
  packument: pk,
  advisories,
  provenance: Object.fromEntries(Object.keys(pk.versions).map((version) => [version, repository])),
});
const policy = (...excludes) => ({ minutes: 10080, excludes });
const lookup = {
  nuxt: pkg(nuxt, [advisory('nuxt', '>= 4.0.0, < 4.6.2', '4.6.2')]),
  '@nuxt/kit': pkg(kit, []),
};
describe('version helpers', () => {
  it('orders releases and prereleases', () => {
    expect(compareVersions('4.6.2', '4.6.10')).toBe(-1);
    expect(compareVersions('4.6.2-rc.1', '4.6.2')).toBe(-1);
    expect(compareVersions('4.6.2', '4.6.2')).toBe(0);
    expect(compareVersions('1.0.0-A', '1.0.0-a')).toBe(-1);
    expect(compareVersions('1.0.0-alpha.2', '1.0.0-alpha.10')).toBe(-1);
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe(-1);
    expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
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
  it('reads pnpm config output, including unset keys', () => {
    expect(policyFromConfig('10080\n', '["nuxt@4.6.2","@nuxt/*"]\n')).toEqual({
      minutes: 10080,
      excludes: ['nuxt@4.6.2', '@nuxt/*'],
    });
    expect(policyFromConfig('', '')).toEqual({ minutes: undefined, excludes: [] });
    expect(policyFromConfig('"10080"', '"nuxt@4.6.2"')).toEqual({
      minutes: undefined,
      excludes: ['nuxt@4.6.2'],
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
      { ...lookup, '@nuxt/kit': pkg(drifted, []) },
      NOW
    );
    expect(verdict.failures).toEqual([expect.stringContaining('@nuxt/kit@4.6.3 fixes no open')]);
  });
  it('rejects a companion whose provenance names another repository', () => {
    const verdict = evaluateExceptions(
      policy('nuxt@4.6.2', '@nuxt/kit@4.6.2'),
      { ...lookup, '@nuxt/kit': pkg(kit, [], 'https://github.com/attacker/kit') },
      NOW
    );
    expect(verdict.failures).toEqual([expect.stringContaining('@nuxt/kit@4.6.2 fixes no open')]);
  });
  it('rejects entries whose provenance cannot be read', () => {
    const verdict = evaluateExceptions(
      policy('nuxt@4.6.2', '@nuxt/kit@4.6.2'),
      {
        nuxt: { packument: nuxt, advisories: lookup.nuxt.advisories },
        '@nuxt/kit': { packument: kit, advisories: [] },
      },
      NOW
    );
    expect(verdict.failures).toEqual([
      'nuxt@4.6.2 has no readable npm provenance source repository',
      '@nuxt/kit@4.6.2 has no readable npm provenance source repository',
    ]);
    expect(verdict.justified).toEqual([]);
  });
  it('keeps a fix that aged past the window as its companions anchor', () => {
    const agedFix = packument('nuxt', { '4.6.1': [20, release()], '4.6.2': [7.1, release()] });
    const lateKit = packument('@nuxt/kit', { '4.6.1': [20, release()], '4.6.2': [6.9, release()] });
    const verdict = evaluateExceptions(
      policy('nuxt@4.6.2', '@nuxt/kit@4.6.2'),
      { nuxt: pkg(agedFix, lookup.nuxt.advisories), '@nuxt/kit': pkg(lateKit) },
      NOW
    );
    expect(verdict.failures).toEqual([]);
    expect(verdict.warnings).toEqual([expect.stringContaining('nuxt@4.6.2 is past')]);
    expect(verdict.justified).toEqual([
      { entry: '@nuxt/kit@4.6.2', reason: 'companion of nuxt@4.6.2' },
    ]);
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
      { nuxt: pkg(mature, lookup.nuxt.advisories) },
      NOW
    );
    expect(verdict.failures).toEqual([expect.stringContaining('fixes no open advisory')]);
  });
  it('rejects a version still inside a vulnerable range or in another major line', () => {
    const verdict = evaluateExceptions(
      policy('nuxt@4.6.2'),
      { nuxt: pkg(nuxt, [advisory('nuxt', '>= 3.0.0, < 3.21.4', '3.21.4')]) },
      NOW
    );
    expect(verdict.failures).toEqual([expect.stringContaining('fixes no open advisory')]);
    const still = evaluateExceptions(
      policy('nuxt@4.6.2'),
      { nuxt: pkg(nuxt, [advisory('nuxt', '<= 4.6.2', '4.6.0')]) },
      NOW
    );
    expect(still.failures).toEqual([
      'nuxt@4.6.2 is not cleared by the vulnerable range of GHSA-test',
    ]);
  });
  it('rejects a fix that is still vulnerable under another advisory', () => {
    const open = { ...advisory('nuxt', '<= 4.6.2', '4.6.3'), ghsa_id: 'GHSA-open' };
    const verdict = evaluateExceptions(
      policy('nuxt@4.6.2', '@nuxt/kit@4.6.2'),
      { ...lookup, nuxt: pkg(nuxt, [...lookup.nuxt.advisories, open]) },
      NOW
    );
    expect(verdict.failures).toEqual([
      'nuxt@4.6.2 is not cleared by the vulnerable range of GHSA-open',
      expect.stringContaining('@nuxt/kit@4.6.2 fixes no open'),
    ]);
  });
  it('fails closed on an unparsable range or a vulnerable advisory without an id', () => {
    for (const [extra, label] of [
      [{ ...advisory('nuxt', null, null), ghsa_id: 'GHSA-null' }, 'GHSA-null'],
      [{ ...advisory('nuxt', '~4.6', '4.7.0'), ghsa_id: 'GHSA-tilde' }, 'GHSA-tilde'],
      [{ ...advisory('nuxt', '<= 4.6.2', '4.6.3'), ghsa_id: undefined }, 'an advisory without'],
    ]) {
      const verdict = evaluateExceptions(
        policy('nuxt@4.6.2'),
        { nuxt: pkg(nuxt, [...lookup.nuxt.advisories, extra]) },
        NOW
      );
      expect(verdict.failures).toEqual([expect.stringContaining(`vulnerable range of ${label}`)]);
    }
  });
  it('ignores withdrawn advisories', () => {
    const withdrawn = (entry) => ({ ...entry, withdrawn_at: daysAgo(1) });
    const fixOnly = evaluateExceptions(
      policy('nuxt@4.6.2'),
      { nuxt: pkg(nuxt, lookup.nuxt.advisories.map(withdrawn)) },
      NOW
    );
    expect(fixOnly.failures).toEqual([expect.stringContaining('fixes no open advisory')]);
    const vulnerable = withdrawn({ ...advisory('nuxt', '<= 4.6.2', '4.6.3'), ghsa_id: 'GHSA-w' });
    const stillFixes = evaluateExceptions(
      policy('nuxt@4.6.2'),
      { nuxt: pkg(nuxt, [...lookup.nuxt.advisories, vulnerable]) },
      NOW
    );
    expect(stillFixes.failures).toEqual([]);
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
      { nuxt: pkg(risky, lookup.nuxt.advisories) },
      NOW
    );
    expect(verdict.failures).toEqual([
      'nuxt@4.6.2 has no npm provenance attestation',
      'nuxt@4.6.2 was published by someone, not GitHub Actions (previous release)',
      'nuxt@4.6.2 adds install scripts: postinstall',
    ]);
  });
  it('vets against the release published before the entry, not a later backport', () => {
    const backported = packument('nuxt', {
      '4.6.1': [20, release()],
      '4.6.2': [2, release()],
      '3.21.9': [1, release({ _npmUser: { name: 'someone' } })],
    });
    const verdict = evaluateExceptions(
      policy('nuxt@4.6.2'),
      { nuxt: pkg(backported, lookup.nuxt.advisories) },
      NOW
    );
    expect(verdict.failures).toEqual([]);
  });
  it('fails patterns and unverifiable entries, warns on matured ones', () => {
    const old = packument('nuxt', { '4.6.1': [30, release()], '4.6.2': [8, release()] });
    const verdict = evaluateExceptions(
      policy('@nuxt/*', 'missing@1.0.0', 'nuxt@4.6.2'),
      { nuxt: pkg(old, []) },
      NOW
    );
    expect(verdict.failures).toEqual([
      expect.stringContaining('exempts every version'),
      expect.stringContaining('could not be verified'),
    ]);
    expect(verdict.warnings).toEqual([expect.stringContaining('past the release-age window')]);
  });
  it('fails a missing or shortened release-age policy, with or without excludes', () => {
    for (const minutes of [undefined, 1, 10079]) {
      expect(evaluateExceptions({ minutes, excludes: [] }, lookup, NOW).failures).toEqual([
        expect.stringContaining('must be at least 10080 minutes'),
      ]);
    }
  });
  it('fails vetting when the previous publisher cannot be established', () => {
    const anonymous = release({ _npmUser: undefined });
    for (const versions of [
      { '4.6.2': [2, release()] },
      { '4.6.1': [20, anonymous], '4.6.2': [2, anonymous] },
    ]) {
      const verdict = evaluateExceptions(
        policy('nuxt@4.6.2'),
        { nuxt: pkg(packument('nuxt', versions), lookup.nuxt.advisories) },
        NOW
      );
      expect(verdict.failures).toEqual([expect.stringContaining('(previous release)')]);
    }
  });
});
