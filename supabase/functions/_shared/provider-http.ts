export class ProviderFailure extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly retryAfterSeconds = 60
  ) {
    super(code);
  }
}
const retryDelay = (response: Response) => {
  const value = response.headers.get('retry-after');
  const seconds = Number(value);
  if (value && Number.isFinite(seconds)) return Math.max(1, Math.min(86400, seconds));
  return retryDate(value);
};
const httpFailure = (response: Response) =>
  new ProviderFailure(
    `provider_http_${response.status}`,
    response.status === 429 || response.status >= 500,
    retryDelay(response)
  );
export async function providerJson(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch = fetch
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { ...init, signal: AbortSignal.timeout(10000) });
  } catch {
    throw new ProviderFailure('provider_transport', true);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw httpFailure(response);
  }
  try {
    return await response.json();
  } catch {
    throw new ProviderFailure('provider_malformed_json', true);
  }
}
function retryDate(value: string | null): number {
  const date = Date.parse(value ?? '');
  return Number.isFinite(date) ? Math.max(1, Math.min(86400, (date - Date.now()) / 1000)) : 60;
}
