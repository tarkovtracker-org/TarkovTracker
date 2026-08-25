import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  authenticateUser,
  createErrorResponse,
  createSuccessResponse,
  handleCorsPreflight,
  validateMethod,
  type AuthSuccess,
} from '../_shared/auth.ts';
import { enforceUserMutationRateLimit } from '../_shared/rate-limit.ts';
import { parseTokenPermissions, TOKEN_PERMISSIONS, type TokenPermission } from './permissions.ts';
import {
  generateToken,
  isTokenGameMode,
  isTokenValueForGameMode,
  TOKEN_GAME_MODES,
  type TokenGameMode,
} from './tokenValue.ts';
const hashToken = async (token: string) => {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};
interface TokenRequestFields {
  permissions: TokenPermission[] | null;
  gameMode: string;
  note: string | null;
  tokenValue: string;
}
type ValidatedTokenFields = TokenRequestFields & {
  permissions: TokenPermission[];
  gameMode: TokenGameMode;
};
type MutationGuard =
  { response: Response } | { user: AuthSuccess['user']; supabase: SupabaseClient };
const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const parseJsonBody = async (req: Request): Promise<Record<string, unknown>> => {
  try {
    const body: unknown = await req.json();
    return isJsonObject(body) ? body : {};
  } catch {
    return {};
  }
};
const parseRequestFields = (body: Record<string, unknown>): TokenRequestFields => ({
  permissions: parseTokenPermissions(body.permissions),
  gameMode: (body.gameMode as string) || '',
  note: (body.note as string | null) || null,
  tokenValue: (body.tokenValue as string | undefined) || '',
});
const gameModePresenceError = (gameMode: string): string | null =>
  gameMode ? null : 'gameMode is required';
const permissionsError = (permissions: TokenPermission[] | null): string | null =>
  permissions ? null : `permissions must be a non-empty array of: ${TOKEN_PERMISSIONS.join(', ')}`;
const gameModeValueError = (gameMode: string): string | null =>
  isTokenGameMode(gameMode) ? null : `gameMode must be one of: ${TOKEN_GAME_MODES.join(', ')}`;
const tokenValueTypeError = (body: Record<string, unknown>): string | null =>
  body.tokenValue !== undefined && typeof body.tokenValue !== 'string'
    ? 'tokenValue must be a string'
    : null;
const tokenValuePrefixError = (fields: TokenRequestFields): string | null => {
  if (!fields.tokenValue || !isTokenGameMode(fields.gameMode)) return null;
  return isTokenValueForGameMode(fields.tokenValue, fields.gameMode)
    ? null
    : 'tokenValue prefix must match gameMode';
};
const asValidatedFields = (fields: TokenRequestFields): ValidatedTokenFields | null => {
  if (!fields.permissions || !isTokenGameMode(fields.gameMode)) return null;
  return { ...fields, permissions: fields.permissions, gameMode: fields.gameMode };
};
const validationError = (
  body: Record<string, unknown>,
  fields: TokenRequestFields
): string | null =>
  [
    gameModePresenceError(fields.gameMode),
    permissionsError(fields.permissions),
    gameModeValueError(fields.gameMode),
    tokenValueTypeError(body),
    tokenValuePrefixError(fields),
  ].find((error) => error !== null) ?? null;
const isTokenLimitError = (error: { code?: string; message?: string }): boolean =>
  error.code === '23514' || (error.message?.includes('Token limit reached') ?? false);
const insertFailureResponse = (
  req: Request,
  error: { code?: string; message?: string }
): Response => {
  if (isTokenLimitError(error)) {
    return createErrorResponse('Token limit reached (3 active)', 409, req);
  }
  console.error('token-create insert failed:', error);
  return createErrorResponse('Failed to create token', 500, req);
};
const insertTokenRow = async (
  supabase: SupabaseClient,
  insertBody: Record<string, unknown>
): Promise<{ data: unknown; error: { code?: string; message?: string } | null }> => {
  const attemptInsert = () =>
    supabase.from('api_tokens').insert(insertBody).select('token_id').single();
  let { data, error } = await attemptInsert();
  if (error?.code === '42703') {
    // Column token_value not present (old schema): retry without it
    delete insertBody.token_value;
    ({ data, error } = await attemptInsert());
  }
  return { data, error };
};
const tokenIdFrom = (data: unknown): string | null =>
  (data as { token_id?: string } | null)?.token_id || null;
const respondWithCreatedToken = async (
  req: Request,
  supabase: SupabaseClient,
  userId: string,
  fields: ValidatedTokenFields
): Promise<Response> => {
  const tokenValue = fields.tokenValue || generateToken(fields.gameMode);
  const tokenHash = await hashToken(tokenValue);
  const { data, error } = await insertTokenRow(supabase, {
    user_id: userId,
    token_hash: tokenHash,
    token_value: tokenValue,
    permissions: fields.permissions,
    game_mode: fields.gameMode,
    note: fields.note,
  });
  if (error) return insertFailureResponse(req, error);
  return createSuccessResponse({ success: true, tokenId: tokenIdFrom(data), tokenValue }, 200, req);
};
const handleCreateToken = async (
  req: Request,
  user: AuthSuccess['user'],
  supabase: SupabaseClient
): Promise<Response> => {
  const body = await parseJsonBody(req);
  const fields = parseRequestFields(body);
  const error = validationError(body, fields);
  if (error) return createErrorResponse(error, 400, req);
  const validated = asValidatedFields(fields);
  if (!validated) return createErrorResponse('Internal server error', 500, req);
  return respondWithCreatedToken(req, supabase, user.id, validated);
};
const authorizeTokenMutation = async (req: Request): Promise<MutationGuard> => {
  const methodError = validateMethod(req, ['POST']);
  if (methodError) return { response: methodError };
  const authResult = await authenticateUser(req);
  if ('error' in authResult) {
    return { response: createErrorResponse(authResult.error, authResult.status, req) };
  }
  const { user, supabase } = authResult as AuthSuccess;
  const rateLimitResponse = await enforceUserMutationRateLimit(
    req,
    supabase,
    user.id,
    'token-create'
  );
  if (rateLimitResponse) return { response: rateLimitResponse };
  return { user, supabase };
};
Deno.serve(async (req) => {
  // CORS preflight
  const cors = handleCorsPreflight(req);
  if (cors) return cors;
  try {
    const guard = await authorizeTokenMutation(req);
    if ('response' in guard) return guard.response;
    return await handleCreateToken(req, guard.user, guard.supabase);
  } catch (error) {
    console.error('token-create error:', error);
    return createErrorResponse('Internal server error', 500, req);
  }
});
