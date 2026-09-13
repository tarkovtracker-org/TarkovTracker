import { authenticateDeletionRequest } from '../_shared/account-deletion-request.ts';
import { createSuccessResponse } from '../_shared/auth.ts';
// Authenticate the UI request; durable work is captured at the authoritative Auth unlink boundary.
Deno.serve(async (req: Request) => {
  const auth = await authenticateDeletionRequest(req);
  if (auth instanceof Response) return auth;
  // The supported Auth unlink transaction invokes the existing identity trigger. Queueing removal
  // before that transaction would wrongly remove roles when Auth refuses the unlink.
  return createSuccessResponse({ cleanupOnUnlink: true, revoked: false }, 200, req);
});
