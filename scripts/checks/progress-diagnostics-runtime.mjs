import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createTestHarness } from 'wrangler';
import { diagnosticEvent } from './progress-diagnostic-fixture.ts';
const harness = createTestHarness({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  workers: [{ configPath: './workers/progress-diagnostics/wrangler.jsonc' }],
});
before(async () => {
  await harness.listen();
});
after(async () => {
  await harness.close();
});
test('workerd logs only the reconstructed custom aggregate', async () => {
  harness.clearLogs();
  const response = await harness.fetch('https://progress-diagnostics.internal/', {
    method: 'POST',
    headers: { Authorization: 'private-sentinel-token', Referer: 'private-sentinel-referrer' },
    body: JSON.stringify({ ...diagnosticEvent(), userId: 'private-sentinel-id' }),
  });
  assert.equal(response.status, 204);
  await Promise.resolve();
  const logs = harness.getLogs();
  const aggregates = logs
    .filter(({ level }) => level === 'log')
    .map(({ message }) => JSON.parse(message));
  assert.deepEqual(aggregates, [diagnosticEvent()]);
  assert.doesNotMatch(JSON.stringify(logs), /private-sentinel/);
});
