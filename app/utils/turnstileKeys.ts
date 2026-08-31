// Official Cloudflare Turnstile testing keys. The sitekey always issues a token and the
// secret always verifies it, so non-production builds exercise the full verification path
// without a real widget. See https://developers.cloudflare.com/turnstile/troubleshooting/testing/
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';
export const TURNSTILE_TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';
export const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
