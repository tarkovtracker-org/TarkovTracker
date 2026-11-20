const CATALOG_GZIP_HEADER = 'X-Tarkov-Catalog-Precompressed';
type PagesRequest = Request & { cf?: { clientAcceptEncoding?: string } };
function hasPositiveWeight(encoding?: string): boolean {
  if (!encoding) return false;
  const [, quality] = encoding.split(';', 2);
  if (quality === undefined) return true;
  const weight = Number(/^\s*q\s*=\s*(\d(?:\.\d{0,3})?)\s*$/i.exec(quality)?.[1]);
  return weight > 0 && weight <= 1;
}
function acceptsGzip(value: string | null): boolean {
  const encodings = value?.split(',') ?? [];
  const gzip = encodings.find((entry) => /^\s*gzip\s*(?:;|$)/i.test(entry));
  const wildcard = encodings.find((entry) => /^\s*\*\s*(?:;|$)/.test(entry));
  return hasPositiveWeight(gzip ?? wildcard);
}
export function canSendCatalogGzip(request?: PagesRequest): boolean {
  if (request?.method !== 'GET') return false;
  // Nitro's same-worker fetches can inherit the outer request context.
  if (!/^\/api\/tarkov\/strings\/?$/.test(new URL(request.url).pathname)) return false;
  return acceptsGzip(request.cf?.clientAcceptEncoding ?? request.headers.get('Accept-Encoding'));
}
export function markCatalogGzip(headers: Headers) {
  headers.set(CATALOG_GZIP_HEADER, 'gzip');
}
export function sendCatalogGzip(response: Response): Response {
  if (response.headers.get(CATALOG_GZIP_HEADER) !== 'gzip') return response;
  const headers = new Headers(response.headers);
  headers.delete(CATALOG_GZIP_HEADER);
  headers.set('Content-Encoding', 'gzip');
  const init = {
    status: response.status,
    statusText: response.statusText,
    headers,
    // The stored body already contains a gzip stream. Apply at the Pages fetch boundary.
    encodeBody: 'manual' as const,
  };
  return new Response(response.body, init);
}
