import { createError, type H3Event } from 'h3';
async function lifecycleRpc(event: H3Event, name: string, body: Record<string, unknown>) {
  const { key, url } = lifecycleConfiguration(event);
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    throw createError({ statusCode: 503, message: 'Provider lifecycle unavailable' });
  });
  if (!response.ok)
    throw createError({ statusCode: 503, message: 'Provider lifecycle unavailable' });
  return await response.json();
}
export async function reserveProviderInitiation(
  event: H3Event,
  userId: string,
  operation: string,
  requestShape: Record<string, unknown>,
  customerId: string | null = null
) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(requestShape))
  );
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  const id: unknown = await lifecycleRpc(event, 'reserve_provider_initiation', {
    p_user_id: userId,
    p_operation: operation,
    p_fingerprint: fingerprint,
    p_customer_id: customerId,
  });
  if (typeof id !== 'string')
    throw createError({ statusCode: 503, message: 'Invalid lifecycle reservation' });
  return id;
}
export async function recordProviderInitiation(event: H3Event, id: string, resource: string) {
  const recorded: unknown = await lifecycleRpc(event, 'record_provider_initiation', {
    p_id: id,
    p_resource: resource,
  });
  if (recorded !== true)
    throw createError({ statusCode: 503, message: 'Provider reconciliation required' });
}
function lifecycleConfiguration(event: H3Event) {
  const config = useRuntimeConfig(event);
  const key = String(config.supabaseServiceKey ?? '');
  const url = String(config.supabaseUrl ?? '');
  validateConfiguration(key, url);
  return { key, url };
}
function validateConfiguration(key: string, url: string) {
  if (!key || !url)
    throw createError({ statusCode: 503, message: 'Provider lifecycle unavailable' });
}
