import {
  createErrorResponse,
  createSuccessResponse,
  validateRequiredFields,
  validateUUIDs,
} from '../_shared/auth.ts';
import {
  authenticateMutation,
  type AuthenticatedMutation,
} from '../_shared/authenticated-mutation.ts';
const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const getRequestBody = async (req: Request): Promise<Record<string, unknown>> => {
  try {
    const body: unknown = await req.json();
    return isObjectRecord(body) ? body : {};
  } catch {
    return {};
  }
};
const getRpcErrorResponse = (req: Request, error: Error): Response => {
  if (error.message.includes('Only team owners')) {
    return createErrorResponse(error.message, 403, req);
  }
  if (error.message.includes('Team not found')) {
    return createErrorResponse(error.message, 404, req);
  }
  console.error('Team disband failed:', error);
  return createErrorResponse('Failed to disband team', 500, req);
};
const disbandTeam = async (req: Request, auth: AuthenticatedMutation): Promise<Response> => {
  const body = await getRequestBody(req);
  const fieldsError = validateRequiredFields(req, body, ['teamId']);
  if (fieldsError) return fieldsError;
  const uuidError = validateUUIDs(req, body, ['teamId']);
  if (uuidError) return uuidError;
  const { error } = await auth.supabase.rpc('disband_team', {
    p_owner_id: auth.user.id,
    p_team_id: String(body.teamId),
  });
  if (!error) {
    return createSuccessResponse(
      { success: true, message: 'Team disbanded successfully' },
      200,
      req
    );
  }
  return getRpcErrorResponse(req, error);
};
Deno.serve(async (req) => {
  const auth = await authenticateMutation(req, 'team-disband');
  if (auth.response) return auth.response;
  return disbandTeam(req, auth);
});
