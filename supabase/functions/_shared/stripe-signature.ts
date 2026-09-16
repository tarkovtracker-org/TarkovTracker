/** Shared unchanged wire contract: raw text, all v1 signatures, constant-time comparison. */
export async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  const parts = sigHeader.split(',').map((part) => part.split('=', 2));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!validTimestamp(timestamp) || signatures.length === 0) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`)
  );
  const expected = new Uint8Array(signed);
  return signatures.some((signature) => matchesSignature(signature, expected));
}
function validTimestamp(timestamp: string | undefined): boolean {
  if (!timestamp) return false;
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  return age <= 300 && age >= -30;
}
function matchesSignature(signature: string, expected: Uint8Array): boolean {
  const bytes = hexToBytes(signature);
  if (!bytes || bytes.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected[i] ^ bytes[i];
  return mismatch === 0;
}
function hexToBytes(hex: string): Uint8Array | null {
  if (typeof hex !== 'string') return null;
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));
}
