type RetirementRequest = {
  url: string;
  method: string;
  headers: Pick<Headers, 'get'>;
};
const RETIRED_HOSTS = new Set(['tarkovtracker.org', 'www.tarkovtracker.org']);
const RETIRED_API_PATHS = ['/api/v2', '/api/token', '/api/progress', '/api/team/progress'];
const ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const ALLOWED_HEADERS = ['Accept', 'Authorization', 'Content-Type', 'If-None-Match', 'User-Agent'];
const allowedMethods = new Set<string | null>(ALLOWED_METHODS);
const allowedHeaders = new Set(ALLOWED_HEADERS.map((header) => header.toLowerCase()));
const RETIREMENT_JSON = JSON.stringify({
  error: 'legacy_api_retired',
  message:
    'This legacy API address has been retired. Update your API base URL to https://api.tarkovtracker.org. See the documentation for migration instructions.',
  api_base_url: 'https://api.tarkovtracker.org',
  documentation_url: 'https://api.tarkovtracker.org/',
});
const RESPONSE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': ALLOWED_METHODS.join(', '),
  'Access-Control-Allow-Headers': ALLOWED_HEADERS.join(', '),
  'Access-Control-Max-Age': '0',
};
function hasAllowedPreflightHeaders(headers: RetirementRequest['headers']): boolean {
  const requested = headers.get('access-control-request-headers');
  if (!requested) return true;
  // HTTP list recipients ignore empty elements (RFC 9110, section 5.6.1.2).
  return requested
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean)
    .every((header) => allowedHeaders.has(header));
}
function isValidPreflight(request: RetirementRequest): boolean {
  if (request.method !== 'OPTIONS') return false;
  if (!request.headers.get('origin')) return false;
  if (!allowedMethods.has(request.headers.get('access-control-request-method'))) return false;
  return hasAllowedPreflightHeaders(request.headers);
}
function responseBody(method: string, status: number): string | null {
  return method === 'HEAD' || status === 204 ? null : RETIREMENT_JSON;
}
export function legacyApiRetirementResponse(request: RetirementRequest): Response | undefined {
  const url = new URL(request.url);
  if (!RETIRED_HOSTS.has(url.hostname)) return;
  const isRetired = RETIRED_API_PATHS.some(
    (path) => url.pathname === path || url.pathname.startsWith(path + '/')
  );
  if (!isRetired) return;
  const status = isValidPreflight(request) ? 204 : 410;
  return new Response(responseBody(request.method, status), { status, headers: RESPONSE_HEADERS });
}
