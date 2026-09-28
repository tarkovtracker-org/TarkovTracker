// Service credentials stay in the trusted runner, never in page JavaScript or global headers.
export function previewAccessHeaders(env = process.env) {
  const id = env.PREVIEW_ACCESS_CLIENT_ID?.trim();
  const secret = env.PREVIEW_ACCESS_CLIENT_SECRET?.trim();
  if (Boolean(id) !== Boolean(secret))
    throw new Error('Both preview Access credentials are required.');
  return id ? { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret } : {};
}
export function assertPreviewTarget(url, origin) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.origin !== origin) {
    throw new Error('Access credentials are restricted to the exact preview origin.');
  }
}
export async function previewGet(request, url, origin) {
  assertPreviewTarget(url, origin);
  return request.get(url, { headers: previewAccessHeaders(), maxRedirects: 0 });
}
export async function protectPreviewBrowser(page, origin) {
  if (!Object.keys(previewAccessHeaders()).length) return;
  await page.route(`${origin}/**`, async (route) => {
    assertPreviewTarget(route.request().url(), origin);
    // route.continue headers survive redirects. Fetch in the runner instead, with
    // redirects disabled, so a redirect can never forward service credentials.
    const response = await route.fetch({
      headers: { ...route.request().headers(), ...previewAccessHeaders() },
      maxRedirects: 0,
    });
    await route.fulfill({ response });
  });
}
