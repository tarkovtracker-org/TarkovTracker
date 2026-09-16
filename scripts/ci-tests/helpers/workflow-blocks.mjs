import assert from 'node:assert/strict';
// Slice a workflow into the text of one job or one of its steps so assertions
// cannot be satisfied by an unrelated job or by a key on a neighbouring step.
// Kept to string slicing because these tests run on Node built-ins alone.
const blockAfter = (text, header, nextPattern) => {
  const start = text.indexOf(header);
  assert.notEqual(start, -1, `missing ${header.trim()}`);
  const rest = text.slice(start + header.length);
  const next = rest.search(nextPattern);
  return next === -1 ? rest : rest.slice(0, next);
};
export const jobBlock = (workflow, job) => blockAfter(workflow, `\n  ${job}:\n`, /\n {2}\S/);
export const workflowStep = (job, name) => blockAfter(job, `      - name: ${name}\n`, /\n {6}- /);
