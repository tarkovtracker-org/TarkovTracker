import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { renderMergeQueueRuleset } from '../ci/render-merge-queue-ruleset.mjs';
const template = () => JSON.parse(readFileSync('.github/main-merge-queue-ruleset.json', 'utf8'));
test('queue rollout cannot use the generic Actions identity or an unprovisioned issuer', () => {
  for (const id of [0, -1, 15368, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => renderMergeQueueRuleset(template(), id), /dedicated positive App ID/);
});
test('renderer pins only admission to the isolated App and keeps rollout disabled', () => {
  const original = template();
  const result = renderMergeQueueRuleset(original, 987654);
  assert.equal(result.enforcement, 'disabled');
  assert.deepEqual(result.bypass_actors, []);
  assert.equal(original.rules[0].parameters.required_status_checks[2].integration_id, 0);
  assert.deepEqual(result.rules[0].parameters.required_status_checks, [
    { context: 'CI Result', integration_id: 15368 },
    { context: 'Preview Result', integration_id: 15368 },
    { context: 'Review Admission', integration_id: 987654 },
  ]);
  assert.deepEqual(result.rules.slice(1), original.rules.slice(1));
});
test('renderer refuses an already active or bypassed policy and ambiguous admission contexts', () => {
  const active = template();
  active.enforcement = 'active';
  assert.throws(() => renderMergeQueueRuleset(active, 987654), /disabled/);
  const bypass = template();
  bypass.bypass_actors.push({ actor_id: 1 });
  assert.throws(() => renderMergeQueueRuleset(bypass, 987654), /bypass-free/);
  const duplicate = template();
  duplicate.rules[0].parameters.required_status_checks.push({
    context: 'Review Admission',
    integration_id: 0,
  });
  assert.throws(() => renderMergeQueueRuleset(duplicate, 987654), /one unprovisioned/);
});
test('Cubic renderer rejects non-main targets and missing native queue protections', () => {
  for (const change of [
    (value) => {
      value.conditions.ref_name.include.push('refs/heads/other');
    },
    (value) => {
      value.rules = value.rules.filter((rule) => rule.type !== 'merge_queue');
    },
    (value) => {
      value.rules[2].parameters.required_review_thread_resolution = false;
    },
    (value) => {
      value.rules[1].parameters.max_entries_to_build = 2;
    },
  ]) {
    const value = template();
    change(value);
    assert.throws(() => renderMergeQueueRuleset(value, 987654));
  }
});
test('Cubic renderer regression detects removed main-only/full-rule validation', async () => {
  const source = readFileSync('scripts/ci/render-merge-queue-ruleset.mjs', 'utf8');
  const mutant = await import(
    `data:text/javascript;base64,${Buffer.from(source.replace('requireTemplateProtections(template);', '')).toString('base64')}`
  );
  const value = template();
  value.conditions.ref_name.include.push('refs/heads/other');
  assert.throws(() => renderMergeQueueRuleset(value, 987654));
  assert.equal(
    mutant.renderMergeQueueRuleset(value, 987654).rules[0].parameters.required_status_checks[2]
      .integration_id,
    987654
  );
});
