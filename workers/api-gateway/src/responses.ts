import { OPENAPI_JSON } from './openapi';
import type { RateLimitResult } from './rateLimiter';
import type { LegacyTokenResponse } from './types';
function resolveOrigin(envOrigin?: string, requestOrigin?: string): string {
  if (!envOrigin || envOrigin === '*') return '*';
  const list = envOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (!list.length) return '*';
  if (requestOrigin && list.includes(requestOrigin)) return requestOrigin;
  return list[0];
}
export function corsHeaders(envOrigin?: string, requestOrigin?: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(envOrigin, requestOrigin),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,If-None-Match',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers':
      'ETag, Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset',
    Vary: 'Origin',
  };
}
export function retryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}
export function rateLimitHeaders(rl: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof rl.limit === 'number') {
    headers['X-RateLimit-Limit'] = String(rl.limit);
  }
  if (typeof rl.remaining === 'number') {
    headers['X-RateLimit-Remaining'] = String(rl.remaining);
  }
  if (typeof rl.resetAt === 'number') {
    headers['X-RateLimit-Reset'] = String(Math.ceil(rl.resetAt / 1000));
    if (!rl.allowed) {
      headers['Retry-After'] = String(retryAfterSeconds(rl.resetAt));
    }
  }
  return headers;
}
export function docsResponse(envOrigin?: string, requestOrigin?: string): Response {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TarkovTracker API Docs</title>
    <link rel="icon" href="https://tarkovtracker.org/favicon.ico" />
  </head>
  <body style="margin:0;min-height:100vh;background:#0e0f12;">
    <div id="app"></div>
    <script
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.43.1"
      integrity="sha384-HjTUYHbvChA/watX+X7iQtuhwMhsCYU600qyfXPYC90fYr/2Y/Mg7ybHlvkp+eUW"
      crossorigin="anonymous"
    ></script>
    <script>
      Scalar.createApiReference('#app', {
        url: '/openapi.json'
      });
    </script>
  </body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...corsHeaders(envOrigin, requestOrigin),
      'Cache-Control': 'no-store',
    },
  });
}
export function openApiResponse(envOrigin?: string, requestOrigin?: string): Response {
  return new Response(OPENAPI_JSON, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(envOrigin, requestOrigin),
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  });
}
/**
 * Create a flat response for token endpoint (legacy format - no data wrapper)
 */
export function tokenFlatResponse(
  tokenData: LegacyTokenResponse,
  envOrigin?: string,
  requestOrigin?: string,
  extraHeaders?: Record<string, string>
): Response {
  const body = { success: true, ...tokenData };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(envOrigin, requestOrigin),
      'Cache-Control': 'no-store',
      ...(extraHeaders ?? {}),
    },
  });
}
/**
 * Create a success response with legacy envelope format
 */
export function successResponse(
  data: unknown,
  meta?: Record<string, unknown>,
  status = 200,
  envOrigin?: string,
  requestOrigin?: string,
  extraHeaders?: Record<string, string>
): Response {
  const body: Record<string, unknown> = { success: true };
  // If data has its own data/meta structure, flatten it
  if (data && typeof data === 'object' && 'data' in data) {
    body.data = (data as Record<string, unknown>).data;
    body.meta = (data as Record<string, unknown>).meta || meta;
  } else {
    body.data = data;
    if (meta) body.meta = meta;
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(envOrigin, requestOrigin),
      'Cache-Control': 'no-store',
      ...(extraHeaders ?? {}),
    },
  });
}
/**
 * Create an error response with legacy envelope format
 */
export function errorResponse(
  error: string,
  status = 500,
  envOrigin?: string,
  requestOrigin?: string,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(envOrigin, requestOrigin),
      'Cache-Control': 'no-store',
      ...(extraHeaders ?? {}),
    },
  });
}
const READ_CACHE_CONTROL = 'private, max-age=15';
// Authorization: responses are token-scoped. Origin: the CORS allow-origin
// header is echoed per request. Accept-Encoding: bodies may be gzipped.
const READ_VARY = 'Accept-Encoding, Authorization, Origin';
const GZIP_MIN_BYTES = 1024;
async function weakEtag(payload: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', payload);
  const hex = Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `W/"${hex}"`;
}
function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === '*') return true;
  const opaque = (value: string) => value.trim().replace(/^W\//i, '');
  return ifNoneMatch.split(',').some((candidate) => opaque(candidate) === opaque(etag));
}
// RFC 9110 qvalue grammar: 0[.0-3 digits] or 1[.up to three zeros]. Anything
// outside that range (q=2, q=abc) is malformed, not a stronger preference.
const QVALUE_PATTERN = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/;
// RFC 9110 Accept-Encoding negotiation. An explicit `gzip;q=0` is a rejection
// and must not be compressed; `*` only applies when a coding is not listed on
// its own. identity is always acceptable unless explicitly refused with
// `identity;q=0`. A malformed or out-of-range q-value falls back to "not
// acceptable" for that coding; gzip falls back to uncompressed (always
// decodable), and an identity rejection is honored.
type ContentCoding = 'gzip' | 'identity' | '*';
const CONTENT_CODINGS = new Set<ContentCoding>(['gzip', 'identity', '*']);
function parseContentCoding(part: string): [ContentCoding, number] | null {
  const [rawCoding, ...params] = part.split(';');
  const coding = rawCoding.trim().toLowerCase() as ContentCoding;
  if (!CONTENT_CODINGS.has(coding)) return null;
  const qParam = params.map((param) => param.trim().toLowerCase()).find((param) => param.startsWith('q='));
  const qValue = qParam?.slice(2) ?? '';
  return [coding, !qParam ? 1 : QVALUE_PATTERN.test(qValue) ? Number(qValue) : 0];
}
function contentCodingQuality(
  preferences: Map<ContentCoding, number>,
  coding: Exclude<ContentCoding, '*'>,
  fallback: number
): number {
  return preferences.get(coding) ?? preferences.get('*') ?? fallback;
}
function negotiateEncoding(header: string | null): { gzip: boolean; identity: boolean } {
  const preferences = new Map<ContentCoding, number>();
  for (const part of header?.split(',') ?? []) {
    const preference = parseContentCoding(part);
    if (preference) preferences.set(...preference);
  }
  return {
    gzip: contentCodingQuality(preferences, 'gzip', 0) > 0,
    identity: contentCodingQuality(preferences, 'identity', 1) > 0,
  };
}
// Conditional read response for GET /progress and GET /team/progress. The
// payload is encoded once so the ETag digest, the gzip size threshold, and the
// response body all back the same bytes — the validator and the body cannot
// disagree. The ETag is derived from the serialized payload (not updated_at) so
// a 304 can never hide a change originating in task metadata or invalidation.
export async function conditionalReadResponse(
  request: Request,
  data: unknown,
  envOrigin?: string,
  requestOrigin?: string,
  extraHeaders?: Record<string, string>
): Promise<Response> {
  const body: Record<string, unknown> = { success: true };
  if (data && typeof data === 'object' && 'data' in data) {
    const wrapped = data as Record<string, unknown>;
    body.data = wrapped.data;
    if (wrapped.meta !== undefined) body.meta = wrapped.meta;
  } else {
    body.data = data;
  }
  const payload = new TextEncoder().encode(JSON.stringify(body));
  const etag = await weakEtag(payload);
  const headers: Record<string, string> = {
    ...corsHeaders(envOrigin, requestOrigin),
    'Cache-Control': READ_CACHE_CONTROL,
    Vary: READ_VARY,
    ETag: etag,
    ...(extraHeaders ?? {}),
  };
  if (etagMatches(request.headers.get('If-None-Match'), etag)) {
    return new Response(null, { status: 304, headers });
  }
  const encoding = negotiateEncoding(request.headers.get('Accept-Encoding'));
  if (!encoding.gzip && !encoding.identity) {
    return errorResponse('no_acceptable_encoding', 406, envOrigin, requestOrigin, {
      Vary: READ_VARY,
      ...(extraHeaders ?? {}),
    });
  }
  headers['Content-Type'] = 'application/json';
  // Compress when gzip is acceptable and either the payload clears the size
  // threshold or the client explicitly refused identity (identity;q=0), in
  // which case uncompressed is not an acceptable response.
  if (encoding.gzip && (payload.byteLength >= GZIP_MIN_BYTES || !encoding.identity)) {
    headers['Content-Encoding'] = 'gzip';
    const stream = new Blob([payload]).stream().pipeThrough(new CompressionStream('gzip'));
    // encodeBody: 'manual' prevents the Workers runtime from double-compressing
    // the already-gzipped stream (the default 'automatic' would re-encode it).
    return new Response(stream, { status: 200, headers, encodeBody: 'manual' });
  }
  return new Response(payload, { status: 200, headers });
}
export function decodeUrlParam(
  raw: string,
  label: string,
  envOrigin?: string,
  requestOrigin?: string
): string | Response {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw).trim();
  } catch {
    return errorResponse(`Invalid ${label} in URL`, 400, envOrigin, requestOrigin);
  }
  if (!decoded) {
    return errorResponse(`Missing ${label} in URL`, 400, envOrigin, requestOrigin);
  }
  return decoded;
}
export async function parseJsonObjectBody(
  request: Request,
  envOrigin?: string,
  requestOrigin?: string,
  extraHeaders?: Record<string, string>
): Promise<Record<string, unknown> | Response> {
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, envOrigin, requestOrigin, extraHeaders);
  }
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
    return errorResponse(
      'Invalid request body (expected object)',
      400,
      envOrigin,
      requestOrigin,
      extraHeaders
    );
  }
  return parsedBody as Record<string, unknown>;
}
