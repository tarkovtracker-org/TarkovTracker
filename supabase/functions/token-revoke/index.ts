import {
  authenticateUser,
  createErrorResponse,
  createSuccessResponse,
  handleCorsPreflight,
  validateMethod,
  validateRequiredFields,
  validateUUIDs,
  type AuthSuccess,
} from 'shared/auth';
import { enforceUserMutationRateLimit } from '../_shared/rate-limit.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCorsPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    const methodError = validateMethod(req, ['DELETE']);
    if (methodError) return methodError;

    const authResult = await authenticateUser(req);
    if ('error' in authResult) {
      return createErrorResponse(authResult.error, authResult.status, req);
    }

    const { user, supabase } = authResult as AuthSuccess;
    const rateLimitResponse = await enforceUserMutationRateLimit(
      req,
      supabase,
      user.id,
      'token-revoke'
    );
    if (rateLimitResponse) return rateLimitResponse;

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return createErrorResponse('Malformed JSON', 400, req);
    }

    const fieldsError = validateRequiredFields(req, body, ['tokenId']);
    if (fieldsError) return fieldsError;

    const uuidError = validateUUIDs(req, body, ['tokenId']);
    if (uuidError) return uuidError;

    const { tokenId } = body as { tokenId: string };
    const { error: deleteError } = await supabase
      .from('api_tokens')
      .delete()
      .eq('token_id', tokenId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Token deletion failed:', deleteError);
      return createErrorResponse('Failed to revoke token', 500, req);
    }

    return createSuccessResponse(
      { success: true, message: 'Token revoked successfully' },
      200,
      req
    );
  } catch (error) {
    console.error('Token revoke error:', error);
    return createErrorResponse('Internal server error', 500, req);
  }
});
