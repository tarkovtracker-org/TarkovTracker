import { lifecycleDeliveryClient } from '../_shared/lifecycle-delivery-client.ts';
import {
  withLifecycleDelivery,
  DeliveryUnavailable,
  deliveryUnavailableResponse,
} from '../_shared/lifecycle-delivery.ts';
import { createErrorResponse, createSuccessResponse } from '../_shared/auth.ts';
import { authenticateDeletionRequest } from '../_shared/account-deletion-request.ts';
import { runAccountDeletion } from '../_shared/account-deletion-workflow.ts';
import {
  claimDeletionJob,
  consumeDeletionAttempt,
  type AccountDeletionClient,
} from '../_shared/account-deletion-lifecycle.ts';
const checkAttempt = async (req: Request, client: AccountDeletionClient, userId: string) => {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip');
  const attempt = await consumeDeletionAttempt(client, userId, ip, req.headers.get('user-agent'));
  if (attempt.error)
    return createErrorResponse(
      'Failed to initialize account deletion. Please try again.',
      500,
      req
    );
  if (!attempt.allowed)
    return createErrorResponse(
      `Too many deletion requests. Please wait ${attempt.retryAfterSeconds} seconds before trying again.`,
      429,
      req
    );
  return null;
};
const deletionResponse = (req: Request, status: string) => {
  if (status === 'error')
    return createErrorResponse('Failed to update account deletion status.', 500, req);
  if (status === 'completed') return createSuccessResponse({ success: true }, 200, req);
  return createSuccessResponse(
    {
      success: false,
      cleanupScheduled: false,
      status,
      message: 'Deletion is not complete. Operator review or a retry is required.',
    },
    202,
    req
  );
};
const processRequest = async (req: Request, client: AccountDeletionClient, userId: string) => {
  const limited = await validateRequest(req, client, userId);
  if (limited) return limited;
  const claim = await claimDeletionJob(client, userId, true);
  if (claim.error)
    return createErrorResponse(
      'Failed to initialize account deletion. Please try again later.',
      500,
      req
    );
  if (!claim.claimToken) return deletionResponse(req, String(claim.status));
  const result = await runAccountDeletion(client, userId, claim.claimToken);
  return deletionResponse(req, result.status);
};
Deno.serve(async (req) => {
  try {
    const auth = await authenticateDeletionRequest(req);
    if (auth instanceof Response) return auth;
    return await withLifecycleDelivery(
      (name, args) => auth.supabase.rpc(name, args),
      'deletion_intake',
      (invocation) =>
        processRequest(
          req,
          lifecycleDeliveryClient(invocation) as unknown as AccountDeletionClient,
          auth.user.id
        )
    );
  } catch (error) {
    if (error instanceof DeliveryUnavailable) return deliveryUnavailableResponse(req);
    return createErrorResponse('Internal server error', 500, req);
  }
});
async function requestDeletion(req: Request, client: AccountDeletionClient, userId: string) {
  const requested = await client.rpc('request_account_lifecycle', {
    p_user_id: userId,
    p_restart: true,
  });
  if (requested.error) return createErrorResponse('Failed to request account deletion.', 500, req);
}
async function validateRequest(req: Request, client: AccountDeletionClient, userId: string) {
  return (await checkAttempt(req, client, userId)) ?? requestDeletion(req, client, userId);
}
