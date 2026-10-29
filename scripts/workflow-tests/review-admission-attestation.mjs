import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  approvalCommand,
  approvalCommandPrefix,
  currentAdminAttestation,
  requireCurrentAdminAttestation,
} from '../ci/review-admission-attestation.mjs';
import { admissionDecision } from '../ci/review-admission-policy.mjs';
const repo = { owner: 'example', repo: 'repo' };
const head = 'a'.repeat(40);
const other = 'b'.repeat(40);
const admin = { id: 7, login: 'owner', type: 'User' };
const writer = { id: 8, login: 'writer', type: 'User' };
function github(roles, comments = []) {
  return {
    rest: {
      repos: {
        getCollaboratorPermissionLevel: async ({ username }) => {
          const role = roles[username];
          if (!role) throw Object.assign(new Error('Not Found'), { status: 404 });
          return { data: { role_name: role.role, user: { id: role.id } } };
        },
      },
      issues: {
        getComment: async ({ comment_id }) => {
          const comment = comments.find((item) => item.id === comment_id);
          if (!comment) throw Object.assign(new Error('Not Found'), { status: 404 });
          return { data: comment };
        },
      },
    },
  };
}
const roles = { owner: { role: 'admin', id: 7 }, writer: { role: 'write', id: 8 } };
const created = '2026-10-29T12:00:00Z';
function comment(id, user, body, updated = created) {
  return { id, user, body, created_at: created, updated_at: updated };
}
test('approval commands name exactly one revision on one line', () => {
  for (const command of ['/approve', '/approve-sensitive']) {
    assert.equal(approvalCommand(`${command} ${head}`, head), true);
    assert.equal(approvalCommand(`  ${command} ${head}  `, head), true);
    assert.equal(approvalCommand(`${command} ${other}`, head), false);
    assert.equal(approvalCommand(`${command} ${head}\nmore`, head), false);
    assert.equal(approvalCommand(`> ${command} ${head}`, head), false);
    assert.equal(approvalCommandPrefix(`\t${command} anything`), true);
  }
  assert.equal(approvalCommand(`/approved ${head}`, head), false);
  assert.equal(approvalCommandPrefix('/approved x'), false);
  assert.equal(approvalCommand(undefined, head), false);
});
test('the newest admin approval for the exact head is the review attestation', async () => {
  const comments = [
    comment(1, admin, `/approve ${head}`),
    comment(2, writer, `/approve ${head}`),
    comment(3, admin, `/approve-sensitive ${head}`),
    comment(4, admin, `/approve ${other}`),
    comment(5, { ...admin, type: 'Bot' }, `/approve ${head}`),
    comment(6, admin, `/approve ${head}`, '2026-10-29T12:05:00Z'),
  ];
  assert.deepEqual(await currentAdminAttestation(github(roles), repo, comments, head), {
    provider: 'admin-attestation',
    reviewId: 3,
    commit: head,
    actorId: 7,
  });
  const nonAdmin = comments.filter((item) => item.user !== admin);
  assert.equal(await currentAdminAttestation(github(roles), repo, nonAdmin, head), null);
  const demoted = { ...roles, owner: { role: 'maintain', id: 7 } };
  assert.equal(await currentAdminAttestation(github(demoted), repo, comments, head), null);
  const renamed = { ...roles, owner: { role: 'admin', id: 99 } };
  assert.equal(await currentAdminAttestation(github(renamed), repo, comments, head), null);
});
test('consumers recheck the attesting comment itself before trusting a receipt', async () => {
  const review = { provider: 'admin-attestation', reviewId: 3, commit: head, actorId: 7 };
  const live = [comment(3, admin, `/approve ${head}`)];
  await requireCurrentAdminAttestation(github(roles, live), repo, review);
  for (const [name, client] of [
    ['deleted', github(roles, [])],
    ['edited', github(roles, [comment(3, admin, 'Withdrawn')])],
    ['retargeted', github(roles, [comment(3, admin, `/approve ${other}`)])],
    ['other author', github(roles, [comment(3, writer, `/approve ${head}`)])],
    ['deleted author', github(roles, [comment(3, null, `/approve ${head}`)])],
    ['lost admin', github({ ...roles, owner: { role: 'write', id: 7 } }, live)],
    [
      'edited by anyone',
      github(roles, [comment(3, admin, `/approve ${head}`, '2026-10-29T12:05:00Z')]),
    ],
  ])
    await assert.rejects(requireCurrentAdminAttestation(client, repo, review), /revoked/, name);
});
function decisionInput(overrides = {}) {
  return {
    pr: {
      number: 9,
      state: 'open',
      draft: false,
      user: { id: 41898282, type: 'Bot' },
      head: { sha: head, ref: 'wip/release-1.2.3-4-1', repo: { full_name: 'example/repo' } },
      base: { sha: other, ref: 'main', repo: { full_name: 'example/repo' } },
    },
    files: [
      { filename: 'CHANGELOG.md', status: 'modified' },
      { filename: 'package.json', status: 'modified' },
    ],
    reviews: [],
    comments: [],
    checks: [],
    threads: [],
    trusted: new Set(),
    crowdinSafe: null,
    dependencySafe: false,
    releaseSafe: true,
    adminAttestation: null,
    ...overrides,
  };
}
test('verified generated release assets are admitted without a review provider', () => {
  assert.deepEqual(admissionDecision(decisionInput()), {
    approved: true,
    risk: 'low',
    review: { provider: 'release-policy', kind: 'review-exempt', commit: head },
    sensitiveApprovalId: null,
  });
  assert.throws(() => admissionDecision(decisionInput({ releaseSafe: false })), /review/i);
  const unresolved = { threads: [{ isResolved: false, isOutdated: false }] };
  assert.throws(() => admissionDecision(decisionInput(unresolved)), /Unresolved review findings/);
  const changes = { reviews: [{ state: 'CHANGES_REQUESTED', user: writer, commit_id: head }] };
  assert.throws(() => admissionDecision(decisionInput(changes)), /Changes requested remain/);
});
test('an admin /approve comment admits a sensitive change in one step', () => {
  const attestation = { provider: 'admin-attestation', reviewId: 3, commit: head, actorId: 7 };
  const input = decisionInput({
    pr: {
      ...decisionInput().pr,
      user: { id: 7, type: 'User' },
      head: { ...decisionInput().pr.head, ref: 'ci/example' },
    },
    files: [{ filename: '.github/workflows/ci.yml', status: 'modified' }],
    releaseSafe: false,
    adminAttestation: attestation,
    comments: [comment(3, admin, `/approve ${head}`)],
    trusted: new Set(['owner']),
  });
  assert.deepEqual(admissionDecision(input), {
    approved: true,
    risk: 'sensitive',
    review: attestation,
    sensitiveApprovalId: 3,
  });
  assert.throws(() => admissionDecision({ ...input, comments: [] }), /Sensitive/);
});
