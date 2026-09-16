import { verifyStripeSignature } from './stripe-signature.ts';
/** B0 only. No database/provider client, mutable toggle, or background work exists here. */
export function deletionMaintenance(): Response {
  return retryResponse();
}
export function stripeMaintenance(secret: string | undefined) {
  return (req: Request): Response | Promise<Response> => {
    if (req.method !== 'POST') return new Response(null, { status: 405 });
    if (!secret) return retryResponse();
    const signature = req.headers.get('stripe-signature');
    if (!signature) return Response.json({ error: 'Invalid signature' }, { status: 401 });
    return verifyAndDefer(req, signature, secret);
  };
}
async function verifyAndDefer(req: Request, signature: string, secret: string): Promise<Response> {
  const rawBody = await req.text();
  if (!(await verifyStripeSignature(rawBody, signature, secret)))
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  return retryResponse();
}
function retryResponse(): Response {
  return Response.json(
    { error: 'Lifecycle maintenance; work not accepted', completed: false },
    { status: 503, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } }
  );
}
