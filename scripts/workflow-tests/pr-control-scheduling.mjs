import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { jobBlock, workflowEvent } from './helpers/workflow-blocks.mjs';
const callerPath = '.github/workflows/pr-controls.yml';
const caller = () => readFileSync(callerPath, 'utf8');
const format = (pattern, ...values) =>
  pattern.replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)]));
function scheduling(source) {
  const job = jobBlock(source, 'controls');
  const value = (field) => job.match(new RegExp(`^ {6}${field}: (.+)$`, 'm'))?.[1];
  const group = value('group');
  assert.ok(group, 'controls concurrency must exist');
  const evaluate = group.startsWith('${{')
    ? new Function('github', 'matrix', 'format', `return (${group.slice(3, -2)});`)
    : () => group;
  assert.ok(['single', 'max'].includes(value('queue') ?? 'single'));
  return {
    group: (event) => evaluate(event.github, { number: event.number }, format),
    queue: value('queue') ?? 'single',
    cancelActive: JSON.parse(value('cancel-in-progress')),
  };
}
function event(id, number = 1, name = 'workflow_run', action) {
  return {
    id,
    number,
    github: { event_name: name, run_id: id, run_attempt: 1, event: { action } },
  };
}
// Native single-pending groups replace only waiting invocations. Active invocations can be
// waiting for the inner publication lock; their replacement must wait until they finish.
// Hold publication during a burst, then drain the FIFO publication queue.
class PublicationQueue {
  constructor(source) {
    this.policy = scheduling(source);
    assert.equal(this.policy.cancelActive, false, 'an active publisher must never be interrupted');
    this.groups = new Map();
    this.publication = [];
  }
  offer(item) {
    const name = this.policy.group(item);
    if (!this.groups.has(name)) {
      this.groups.set(name, []);
      this.publication.push(item);
      return;
    }
    const pending = this.groups.get(name);
    if (this.policy.queue === 'single') pending.length = 0;
    pending.push(item);
  }
  drain(whilePublishing) {
    const completed = [];
    while (this.publication.length) {
      const item = this.publication.shift();
      completed.push(item);
      whilePublishing(item, this);
      const name = this.policy.group(item);
      const next = this.groups.get(name).shift();
      if (next) this.publication.push(next);
      else this.groups.delete(name);
    }
    return completed;
  }
}
function burst(source, events, whilePublishing = () => {}) {
  const queue = new PublicationQueue(source);
  for (const item of events) queue.offer(item);
  return queue.drain(whilePublishing);
}
test('a blocked publication queue retains the active passive refresh and newest pending refresh', () => {
  const events = Array.from({ length: 40 }, (_, index) => event(index + 1));
  assert.deepEqual(
    burst(caller(), events).map((item) => item.id),
    [1, 40]
  );
});
test('a refresh burst puts one passive invocation ahead of a later explicit operation', () => {
  const refreshes = Array.from({ length: 40 }, (_, index) => event(index + 1));
  const approval = event(41, 1, 'workflow_dispatch');
  const completed = burst(caller(), [...refreshes, approval]);
  assert.equal(completed.indexOf(approval), 1);
});
test('different PR refreshes remain independent while every explicit and lifecycle event survives', () => {
  const events = [];
  for (let index = 1; index <= 40; index++) {
    events.push(event(index, 1), event(index + 40, 2));
  }
  const protectedEvents = [
    event(81, 1, 'issue_comment'),
    event(82, 1, 'issue_comment'),
    event(83, 1, 'workflow_dispatch'),
    event(84, 1, 'workflow_dispatch'),
    event(85, 1, 'pull_request_target', 'synchronize'),
    event(86, 1, 'pull_request_target', 'closed'),
    event(87, 1, 'future_event'),
  ];
  const completed = burst(caller(), [...events, ...protectedEvents]);
  assert.deepEqual(
    completed.filter((item) => item.github.event_name === 'workflow_run').map((item) => item.id),
    [1, 41, 40, 80]
  );
  for (const item of protectedEvents) assert.ok(completed.includes(item));
  assert.equal(completed.length, 4 + protectedEvents.length);
});
test('only workflow completion refreshes share a group; retries and explicit requests are distinct', () => {
  const policy = scheduling(caller());
  assert.equal(policy.queue, 'single');
  assert.equal(policy.group(event(1)), policy.group(event(2)));
  assert.notEqual(policy.group(event(1, 1)), policy.group(event(2, 2)));
  const first = event(1, 1, 'workflow_dispatch');
  const retry = { ...first, github: { ...first.github, run_attempt: 2 } };
  for (const other of [event(2, 1, 'workflow_dispatch'), retry, event(1, 2, 'workflow_dispatch')])
    assert.notEqual(policy.group(first), policy.group(other));
  assert.notEqual(policy.group(first), policy.group(event(1)));
});
test('a rejected controls rerun cannot replace a valid pending passive refresh', () => {
  const active = event(100);
  const pending = event(102);
  const old = event(90);
  const rerun = { ...old, github: { ...old.github, run_attempt: 2 } };
  const completed = burst(caller(), [active, pending, rerun]);
  assert.ok(completed.includes(pending), 'the first-attempt refresh must survive an invalid rerun');
  assert.notEqual(scheduling(caller()).group(active), scheduling(caller()).group(rerun));
});
test('arrivals during publication preserve the active writer and leave a refresh after its snapshot', () => {
  const completed = burst(caller(), [event(1)], (current, queue) => {
    if (current.id === 1) for (let id = 2; id <= 20; id++) queue.offer(event(id));
  });
  assert.deepEqual(
    completed.map((item) => item.id),
    [1, 20]
  );
  const queue = new PublicationQueue(caller());
  queue.offer(event(1));
  assert.equal(queue.drain(() => {}).length, 1);
  queue.offer(event(2));
  assert.equal(queue.drain(() => {}).length, 1, 'a later wave must still reach publication');
});
test('the reusable publisher requires the original caller on trusted main before entering the environment', () => {
  const source = readFileSync('.github/workflows/pr-controls-publish.yml', 'utf8');
  const job = jobBlock(source, 'controls');
  const expression = job.match(/    if: >-\n((?: {6}.+\n)+)/)[1].trim();
  const allowed = new Function('github', 'format', `return (${expression});`);
  const github = {
    repository: 'example/repo',
    ref: 'refs/heads/main',
    workflow_ref: 'example/repo/.github/workflows/pr-controls.yml@refs/heads/main',
  };
  assert.equal(allowed(github, format), true);
  for (const changed of [
    { ...github, ref: 'refs/pull/1/merge' },
    { ...github, workflow_ref: 'example/repo/.github/workflows/other.yml@refs/heads/main' },
    { ...github, workflow_ref: 'example/repo/.github/workflows/pr-controls.yml@refs/heads/topic' },
    { ...github, repository: 'foreign/repo' },
  ])
    assert.equal(allowed(changed, format), false);
  assert.match(
    workflowEvent(source, 'workflow_call'),
    /pull_request:\n.*\n {8}required: true\n {8}type: number/
  );
  assert.doesNotMatch(
    source,
    /workflow_dispatch:|pull_request_target:|workflow_run:|secrets: inherit/
  );
  assertPublisherEnvironment(job);
  assert.match(job, /name: pr-controls-\$\{\{ inputs.pull_request \}\}/);
});
test('only the required publisher key is forwarded explicitly into the protected reusable job', () => {
  const invocation = jobBlock(caller(), 'controls');
  const source = readFileSync('.github/workflows/pr-controls-publish.yml', 'utf8');
  const inputs = workflowEvent(source, 'workflow_call');
  assert.equal(
    invocation.match(/^ {4}secrets:\n((?: {6}.+\n)+)/m)?.[1],
    '      REVIEW_ADMISSION_PRIVATE_KEY: ${{ secrets.REVIEW_ADMISSION_PRIVATE_KEY }}\n'
  );
  assert.equal(
    `${inputs}\n`.match(/^ {4}secrets:\n((?: {6,}.+\n)+)/m)?.[1],
    '      REVIEW_ADMISSION_PRIVATE_KEY:\n        required: true\n'
  );
  assertPublisherEnvironment(jobBlock(source, 'controls'));
  assert.doesNotMatch(invocation, /secrets: inherit/);
});
test('the caller coalescer and admission publisher use distinct locks without replacement cancellation', () => {
  const source = readFileSync('.github/workflows/pr-controls-publish.yml', 'utf8');
  const publisher = jobBlock(source, 'controls');
  const admission = jobBlock(
    readFileSync('.github/workflows/review-admission.yml', 'utf8'),
    'admission'
  );
  const lock =
    'group: review-admission-publication\n      queue: max\n      cancel-in-progress: false';
  assert.ok(publisher.includes(lock));
  assert.ok(admission.includes(lock));
  const policy = scheduling(caller());
  for (const item of [event(1), event(2, 2), event(3, 1, 'workflow_dispatch')])
    assert.notEqual(policy.group(item), 'review-admission-publication');
  assert.match(
    jobBlock(caller(), 'controls'),
    /uses: \.\/\.github\/workflows\/pr-controls-publish.yml/
  );
});
function assertPublisherEnvironment(job) {
  const environment = job.match(/^ {4}environment:\n((?: {6}.*\n)+)/m)?.[1] ?? '';
  assert.match(environment, /^ {6}name: review-admission$/m);
  assert.match(environment, /^ {6}deployment: false$/m);
}
