/** A dedicated server-only invocation secret, never a user JWT or service-role fallback. */
export async function authorizedLifecycleWorker(
  req: Request,
  secret: string | undefined
): Promise<boolean> {
  if (!configuredSecret(secret)) return false;
  const presented = req.headers.get('authorization') ?? '';
  if (presented.length > 1024) return false;
  const encode = new TextEncoder();
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encode.encode(presented)),
    crypto.subtle.digest('SHA-256', encode.encode(`Bearer ${secret}`)),
  ]);
  return sameDigest(actual, expected);
}
function sameDigest(actual: ArrayBuffer, expected: ArrayBuffer): boolean {
  const left = new Uint8Array(actual);
  const right = new Uint8Array(expected);
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}
function configuredSecret(secret: string | undefined): secret is string {
  return typeof secret === 'string' && secret.length >= 32;
}
