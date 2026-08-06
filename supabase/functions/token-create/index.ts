import {
  authenticateUser,
  createErrorResponse,
  createSuccessResponse,
  handleCorsPreflight,
  validateMethod,
  type AuthSuccess,
} from '../_shared/auth.ts';
import { enforceUserMutationRateLimit } from '../_shared/rate-limit.ts';
import {
  generateToken,
  isTokenGameMode,
  isTokenValueForGameMode,
  TOKEN_GAME_MODES,
} from './tokenValue.ts';
const hashToken = async (token: string) => {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};
Deno.serve(async (req) => {
  // CORS preflight
  const cors = handleCorsPreflight(req);
  if (cors) return cors;
  try {
    const methodError = validateMethod(req, ['POST']);
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
      'token-create'
    );
    if (rateLimitResponse) return rateLimitResponse;
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      // ignore, handled below
    }
    const permissions = (body.permissions as string[]) || [];
    const gameMode = (body.gameMode as string) || '';
    const note = (body.note as string | null) || null;
    let tokenValue = (body.tokenValue as string | undefined) || '';
    if (!permissions.length || !gameMode) {
      return createErrorResponse('gameMode and permissions are required', 400, req);
    }
    if (!isTokenGameMode(gameMode)) {
      return createErrorResponse(
        `gameMode must be one of: ${TOKEN_GAME_MODES.join(', ')}`,
        400,
        req
      );
    }
    if (body.tokenValue !== undefined && typeof body.tokenValue !== 'string') {
      return createErrorResponse('tokenValue must be a string', 400, req);
    }
    if (tokenValue && !isTokenValueForGameMode(tokenValue, gameMode)) {
      return createErrorResponse('tokenValue prefix must match gameMode', 400, req);
    }
    if (!tokenValue) tokenValue = generateToken(gameMode);
    const tokenHash = await hashToken(tokenValue);
    const insertBody: Record<string, unknown> = {
      user_id: user.id,
      token_hash: tokenHash,
      token_value: tokenValue,
      permissions,
      game_mode: gameMode,
      note,
    };
    const attemptInsert = () =>
      supabase.from('api_tokens').insert(insertBody).select('token_id').single();
    let { data, error } = await attemptInsert();
    if (error?.code === '42703') {
      // Column token_value not present (old schema): retry without it
      delete insertBody.token_value;
      ({ data, error } = await attemptInsert());
    }
    if (error) {
      if (error.code === '23514' || error.message?.includes('Token limit reached')) {
        return createErrorResponse('Token limit reached (3 active)', 409, req);
      }
      console.error('token-create insert failed:', error);
      return createErrorResponse('Failed to create token', 500, req);
    }
    const tokenId = (data as { token_id?: string } | null)?.token_id || null;
    return createSuccessResponse({ success: true, tokenId, tokenValue }, 200, req);
  } catch (error) {
    console.error('token-create error:', error);
    return createErrorResponse('Internal server error', 500, req);
  }
});
