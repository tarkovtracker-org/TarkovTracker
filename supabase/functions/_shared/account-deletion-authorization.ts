export interface DeletionAuthorization {
  userId: string;
  sessionId: string;
  authenticatedAt: string;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const authenticatedAudience = (value: unknown): boolean =>
  value === 'authenticated' || (Array.isArray(value) && value.includes('authenticated'));
const oauthAuthenticationTime = (amr: unknown): number | null => {
  if (!Array.isArray(amr) || amr.length === 0) return null;
  if (
    !amr.every(
      (entry) =>
        isRecord(entry) && typeof entry.method === 'string' && Number.isSafeInteger(entry.timestamp)
    )
  )
    return null;
  const times = amr
    .filter((entry) => entry.method === 'oauth')
    .map((entry) => entry.timestamp as number);
  return times.length ? Math.max(...times) : null;
};
// Only pass claims returned by authenticateUser/getClaims; request bodies and JWT iat are not proof.
export const readDeletionAuthorization = (
  claims: Readonly<Record<string, unknown>>,
  issuer: string,
  now = Math.floor(Date.now() / 1000)
): DeletionAuthorization | null => {
  if (!isUuid(claims.sub) || !isUuid(claims.session_id)) return null;
  if (
    claims.iss !== issuer ||
    claims.role !== 'authenticated' ||
    claims.is_anonymous !== false ||
    !authenticatedAudience(claims.aud)
  )
    return null;
  const time = oauthAuthenticationTime(claims.amr);
  if (time === null || time < now - 300 || time > now + 30) return null;
  return {
    userId: claims.sub,
    sessionId: claims.session_id,
    authenticatedAt: new Date(time * 1000).toISOString(),
  };
};
export const hasDeletionConfirmation = (body: unknown): boolean =>
  isRecord(body) && body.action === 'delete_account';
