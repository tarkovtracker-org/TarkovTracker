import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  jobBlock,
  permissionsBlock,
  workflowEvent,
  workflowStep,
} from './helpers/workflow-blocks.mjs';
const read = (path) => readFileSync(path, 'utf8');
test('security is a reusable workflow with only the weekly schedule as a standalone trigger', () => {
  const security = read('.github/workflows/security.yml');
  workflowEvent(security, 'workflow_call');
  assert.match(workflowEvent(security, 'schedule'), /cron: '0 0 \* \* 0'/);
  assert.throws(() => workflowEvent(security, 'push'), /missing/);
  assert.throws(() => workflowEvent(security, 'pull_request'), /missing/);
  const scan = jobBlock(security, 'security-scan');
  assert.match(
    workflowStep(scan, 'Audit production dependencies'),
    /run: pnpm audit --prod --audit-level=critical$/m
  );
  const informational = workflowStep(scan, 'Audit all dependencies (informational)');
  assert.match(informational, /::notice title=Informational dependency audit::/);
  assert.doesNotMatch(informational, /exit 1/);
  assert.match(workflowStep(scan, 'Fail on Gitleaks findings'), /exit 1/);
  assert.match(workflowStep(scan, 'Install Gitleaks CLI'), /sha256sum --check --strict/);
  const codeql = jobBlock(security, 'codeql');
  assert.match(permissionsBlock(codeql, '    '), /^ {6}security-events: write$/m);
  assert.match(codeql, /github\/codeql-action\/analyze@[a-f0-9]{40}/);
  assert.doesNotMatch(codeql, /continue-on-error/);
});
test('CI calls the security workflow for every event and gates CI Result on it', () => {
  const ci = read('.github/workflows/ci.yml');
  const security = jobBlock(ci, 'security');
  assert.match(security, /^ {4}uses: \.\/\.github\/workflows\/security\.yml$/m);
  // No `if:`/`needs:` gate: pull requests, main pushes and explicit dispatches all run it.
  assert.doesNotMatch(security, /^ {4}if:/m);
  assert.doesNotMatch(security, /^ {4}needs:/m);
  const permissions = permissionsBlock(security, '    ');
  assert.match(permissions, /^ {6}security-events: write$/m);
  assert.match(permissions, /^ {6}actions: read$/m);
  assert.match(permissions, /^ {6}contents: read$/m);
  const result = jobBlock(ci, 'ci-result');
  const needs = result.slice(result.indexOf('needs:'), result.indexOf('runs-on:'));
  assert.match(needs, /\bsecurity,?\s/);
  // Ordinary wip/** push CI is gone: staging branches receive CI only through explicit dispatch.
  assert.match(workflowEvent(ci, 'push'), /^ {4}branches: \[main\]$/m);
  workflowEvent(ci, 'workflow_dispatch');
  assert.match(workflowEvent(ci, 'pull_request'), /branches: \[main\]/);
});
