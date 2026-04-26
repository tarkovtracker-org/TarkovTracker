import { createError, defineEventHandler, getQuery, setResponseHeaders } from 'h3';
import { resolveTarkovDevProfileSource } from '@/utils/tarkovDevProfileSource';
function readProfileUrlQuery(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
}
function createProfileFetchError(statusCode = 502) {
  return createError({
    statusCode,
    statusMessage:
      'Unable to fetch Tarkov.dev profile. Open the profile on Tarkov.dev, then try again.',
  });
}
export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { 'Cache-Control': 'no-store' });
  const query = getQuery(event);
  const source = resolveTarkovDevProfileSource(readProfileUrlQuery(query.url));
  if (!source.ok) {
    throw createError({
      statusCode: 400,
      statusMessage: source.error,
    });
  }
  let response: Response;
  try {
    response = await fetch(source.data.profileJsonUrl, {
      headers: {
        accept: 'application/json',
      },
    });
  } catch {
    throw createProfileFetchError();
  }
  if (response.status === 404) throw createProfileFetchError(404);
  if (!response.ok) throw createProfileFetchError();
  try {
    return (await response.json()) as unknown;
  } catch {
    throw createProfileFetchError();
  }
});
