import { logger } from '../utils/logger';
import type { Env } from '../types';
const REQUEST_TIMEOUT_MS = 3000;
const ERROR_BODY_MAX_BYTES = 1024;
type Outcome = {
  outcome:
    | 'ok'
    | 'missing_rpc'
    | 'transient'
    | 'authorization'
    | 'malformed'
    | 'http_error'
    | 'network_error'
    | 'timeout';
  status?: number;
};
function parseErrorCode(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' ? Reflect.get(value, 'code') : null;
  } catch {
    return null;
  }
}
async function readErrorCode(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  try {
    return parseErrorCode(await readBoundedBody(reader));
  } finally {
    await reader.cancel();
  }
}
async function readBoundedBody(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  let text = '';
  let bytes = 0;
  const decoder = new TextDecoder();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > ERROR_BODY_MAX_BYTES) return '';
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}
function classifyStatus(status: number): Outcome['outcome'] {
  if (status === 401 || status === 403) return 'authorization';
  if (status === 429 || status >= 500) return 'transient';
  return 'http_error';
}
async function classifyResponse(response: Response, increment: boolean): Promise<Outcome> {
  if (increment && response.status === 404) {
    const code = await readErrorCode(response);
    return { outcome: missingRpcOutcome(code), status: 404 };
  }
  await response.body?.cancel();
  return { outcome: response.ok ? 'ok' : classifyStatus(response.status), status: response.status };
}
function missingRpcOutcome(code: unknown): Outcome['outcome'] {
  if (code === 'PGRST202') return 'missing_rpc';
  return typeof code === 'string' ? 'http_error' : 'malformed';
}
async function requestOutcome(
  url: string,
  init: RequestInit,
  increment: boolean
): Promise<Outcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return await classifyResponse(response, increment);
  } catch {
    return { outcome: controller.signal.aborted ? 'timeout' : 'network_error' };
  } finally {
    clearTimeout(timeout);
  }
}
/** Best effort, one increment attempt. An ambiguous write is never retried. */
export async function updateTokenUsage(env: Env, tokenId: string): Promise<void> {
  const headers = {
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };
  const result = await requestOutcome(
    `${env.SUPABASE_URL}/rest/v1/rpc/increment_token_usage`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_token_id: tokenId }),
    },
    true
  );
  if (result.outcome === 'ok') return;
  logger.warn('token_usage_outcome', { operation: 'increment', ...result });
  if (result.outcome !== 'missing_rpc') return;
  // Compatibility only: this does not recover the lost lifetime increment.
  const fallback = await requestOutcome(
    `${env.SUPABASE_URL}/rest/v1/api_tokens?token_id=eq.${tokenId}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    },
    false
  );
  logger.warn('token_usage_outcome', {
    operation: 'timestamp_fallback',
    ...fallback,
    outcome: fallback.outcome === 'ok' ? 'timestamp_only' : fallback.outcome,
  });
}
