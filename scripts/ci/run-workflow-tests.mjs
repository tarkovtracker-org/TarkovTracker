import { spawnSync } from 'node:child_process';
import { selectWorkflowTests, workflowTestFiles } from './workflow-test-selection.mjs';
const all = workflowTestFiles();
const selected = selectWorkflowTests(all);
if (selected.length === 0) throw new Error('No workflow tests discovered');
console.log(`Workflow tooling: ${selected.length}/${all.length} test files selected`);
const result = spawnSync(process.execPath, ['--test', ...selected], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
