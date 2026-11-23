import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isValidPlan } from './validation-plan.mjs';
// Keep the initial sample narrow: frontend directories, simple paths, and Vue or CSS files.
const frontendPath =
  /^app\/(?:assets|components|features|layouts|pages)\/(?:[\w@-][\w.@-]*\/)*[\w@-][\w.@-]*\.(?:css|vue)$/u;
function frontendOnly(paths) {
  return paths.every((path) => typeof path === 'string' && frontendPath.test(path));
}
function fullPlanPaths(plan) {
  return isValidPlan(plan) && plan.full && Array.isArray(plan.paths) ? plan.paths : [];
}
export function supabaseShadowDecision(plan) {
  const paths = fullPlanPaths(plan);
  if (!paths.length) return 'not-applicable';
  return frontendOnly(paths) ? 'would-skip' : 'would-run';
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const decision = supabaseShadowDecision(JSON.parse(process.env.VALIDATION_PLAN));
  const report = `Supabase DB shadow decision: ${decision} (observational only)`;
  console.log(report);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
}
