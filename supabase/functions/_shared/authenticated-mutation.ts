import type { SupabaseClient } from '@supabase/supabase-js';
import {
  authenticateUser,
  createErrorResponse,
  handleCorsPreflight,
  validateMethod,
} from './auth.ts';
import { enforceUserMutationRateLimit, type MutationRateLimitAction } from './rate-limit.ts';
export type AuthenticatedMutation = {
  response: null;
  supabase: SupabaseClient;
  user: { email?: string; id: string };
};
type RejectedMutation = {
  response: Response;
  supabase: null;
  user: null;
};
export type MutationStep<T> = { response: null; value: T } | { response: Response; value: null };
export const acceptMutationStep = <T>(value: T): MutationStep<T> => ({
  response: null,
  value,
});
export const rejectMutationStep = <T>(response: Response): MutationStep<T> => ({
  response,
  value: null,
});
const getEarlyMutationResponse = (req: Request): Response | null =>
  handleCorsPreflight(req) ?? validateMethod(req, ['POST']);
const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === '[object Object]';
export const readJsonObject = async (req: Request): Promise<Record<string, unknown>> => {
  try {
    const parsed = await req.json();
    return isObjectRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};
export const readJoinCodeBody = async (req: Request) => {
  const body = await readJsonObject(req);
  const joinCode = typeof body.join_code === 'string' ? body.join_code : body.password;
  return { body, joinCode: typeof joinCode === 'string' ? joinCode : undefined };
};
export const authenticateMutation = async (
  req: Request,
  action: MutationRateLimitAction
): Promise<AuthenticatedMutation | RejectedMutation> => {
  const earlyResponse = getEarlyMutationResponse(req);
  if (earlyResponse) return { response: earlyResponse, supabase: null, user: null };
  const authResult = await authenticateUser(req);
  if ('error' in authResult) {
    return {
      response: createErrorResponse(authResult.error, authResult.status, req),
      supabase: null,
      user: null,
    };
  }
  const rateLimitResponse = await enforceUserMutationRateLimit(
    req,
    authResult.supabase,
    authResult.user.id,
    action
  );
  if (rateLimitResponse) return { response: rateLimitResponse, supabase: null, user: null };
  return { response: null, supabase: authResult.supabase, user: authResult.user };
};
