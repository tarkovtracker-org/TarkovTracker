import { previewOrigin, waitForDeployment } from './readiness.mjs';
// Finish the shared startup window before either worker can navigate the deployment.
// Access sessions stay process-local; workers exchange their own scoped sessions as before.
export default async function setupPreviewSmoke() {
  await waitForDeployment(previewOrigin());
}
