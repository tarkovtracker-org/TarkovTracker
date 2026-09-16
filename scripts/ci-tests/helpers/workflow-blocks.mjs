import assert from 'node:assert/strict';
// Slice a workflow into the text of one job or one of its steps so assertions
// cannot be satisfied by an unrelated job or by a key on a neighbouring step.
// Kept to string slicing because these tests run on Node built-ins alone.
/** Require a named block and stop at the next sibling boundary. */
const blockAfter = (text, header, nextPattern) => {
  const start = text.indexOf(header);
  assert.notEqual(start, -1, `missing ${header.trim()}`);
  const rest = text.slice(start + header.length);
  const next = rest.search(nextPattern);
  return next === -1 ? rest : rest.slice(0, next);
};
/** Extract one workflow job without including later jobs. */
export const jobBlock = (workflow, job) => blockAfter(workflow, `\n  ${job}:\n`, /\n {2}\S/);
/** Extract one named step without including later steps. */
export const workflowStep = (job, name) => blockAfter(job, `      - name: ${name}\n`, /\n {6}- /);
/** Extract a trigger only within the workflow's event configuration. */
export const workflowEvent = (workflow, event) => {
  const events = blockAfter(workflow, '\non:\n', /\n\S/);
  return blockAfter(events, `  ${event}:\n`, /\n {2}\S/);
};
