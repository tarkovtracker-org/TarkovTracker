import { describe, expect, it } from 'vitest';
import { ACCEPTED_ADVISORIES, evaluateAudit } from './audit-dependencies.mjs';
const advisory = (id, name, severity = 'low', paths = ['.>tool>pkg']) => ({
  github_advisory_id: id,
  module_name: name,
  severity,
  title: 'test',
  findings: [{ version: '1.0.0', paths }],
});
const report = (...advisories) => ({
  advisories: Object.fromEntries(advisories.map((entry, index) => [index, entry])),
});
const accepted = {
  'GHSA-a': { package: 'pkg', via: ['tool>pkg'], reason: 'unreachable', expires: '2026-11-03' },
};
describe('evaluateAudit', () => {
  it('passes a clean report', () => {
    expect(evaluateAudit(report(), {}, '2026-10-06')).toEqual({ failures: [], warnings: [] });
  });
  it('fails on any unaccepted advisory, including low severity', () => {
    const verdict = evaluateAudit(report(advisory('GHSA-b', 'other')), accepted, '2026-10-06');
    expect(verdict.failures).toEqual([
      expect.stringContaining('unaccepted production advisory GHSA-b'),
    ]);
  });
  it('accepts a matching, unexpired entry', () => {
    const verdict = evaluateAudit(
      report(advisory('GHSA-a', 'pkg', 'high')),
      accepted,
      '2026-11-03'
    );
    expect(verdict.failures).toEqual([]);
  });
  it('fails an expired or mismatched acceptance', () => {
    expect(
      evaluateAudit(report(advisory('GHSA-a', 'pkg')), accepted, '2026-11-04').failures
    ).toEqual([expect.stringContaining('expired 2026-11-03')]);
    expect(
      evaluateAudit(report(advisory('GHSA-a', 'other')), accepted, '2026-10-06').failures
    ).toEqual([expect.stringContaining('accepted for pkg, not other')]);
  });
  it('fails a finding on an unreviewed or missing dependency path', () => {
    const paths = ['.>tool>pkg', '.>runtime>pkg', '.>notool>pkg'];
    expect(
      evaluateAudit(report(advisory('GHSA-a', 'pkg', 'low', paths)), accepted, '2026-10-06')
        .failures
    ).toEqual([
      'GHSA-a reaches pkg through an unreviewed path: .>runtime>pkg',
      'GHSA-a reaches pkg through an unreviewed path: .>notool>pkg',
    ]);
    expect(
      evaluateAudit(report(advisory('GHSA-a', 'pkg', 'low', [])), accepted, '2026-10-06').failures
    ).toEqual([expect.stringContaining('(no dependency path reported)')]);
  });
  it('warns about stale acceptances', () => {
    expect(evaluateAudit(report(), accepted, '2026-10-06').warnings).toEqual([
      'GHSA-a is no longer reported; remove its acceptance',
    ]);
  });
  it('fails closed on a missing or errored report', () => {
    for (const bad of [undefined, null, {}, { error: { code: 'ERR' } }, []]) {
      expect(evaluateAudit(bad, {}, '2026-10-06').failures).toHaveLength(1);
    }
  });
  it('documents every accepted advisory', () => {
    for (const entry of Object.values(ACCEPTED_ADVISORIES)) {
      expect(entry.package).toBeTruthy();
      expect(entry.reason).toBeTruthy();
      expect(entry.expires).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.via.length).toBeGreaterThan(0);
      for (const chain of entry.via) expect(chain.endsWith(entry.package)).toBe(true);
    }
  });
});
