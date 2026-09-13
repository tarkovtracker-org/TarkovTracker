import {
  authenticateUser,
  handleCorsPreflight,
  validateMethod,
  createErrorResponse,
} from './auth.ts';
export const authenticateDeletionRequest = async (req: Request) => {
  const early = handleCorsPreflight(req) ?? validateMethod(req, ['POST']);
  if (early) return early;
  const auth = await authenticateUser(req);
  if ('error' in auth) return createErrorResponse(auth.error, auth.status, req);
  return auth;
};
