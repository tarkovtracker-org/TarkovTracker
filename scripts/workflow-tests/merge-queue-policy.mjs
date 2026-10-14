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
