import { readJsonObject } from '../_shared/authenticated-mutation.ts';
import { authenticateDeletionRequest } from '../_shared/account-deletion-request.ts';
import { createErrorResponse, createSuccessResponse } from '../_shared/auth.ts';
Deno.serve(async (req) => {
  const auth = await authenticateDeletionRequest(req);
  if (auth instanceof Response) return auth;
  const body = await readJsonObject(req);
  const { data, error } = await auth.supabase.rpc('account_lifecycle_status', {
    p_user_id: auth.user.id,
    p_cancel: body.action === 'cancel',
  });
  if (error) return createErrorResponse('Unable to load deletion request', 503, req);
  return createSuccessResponse(data, 200, req);
});
