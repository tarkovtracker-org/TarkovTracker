// Local-only workerd profiling harness. Imports the production implementation; no remote bindings.
import { createPrecomputedResponseReader } from '@/server/utils/precomputedResponse';
import { isPrecomputedEnvelope } from '@/server/utils/precomputedTarkov';
const read = createPrecomputedResponseReader();
type LocalEnv = { SNAPSHOTS: { get: (key: string, type: 'json' | 'text') => Promise<unknown> } };
async function baseline(env: LocalEnv): Promise<Response> {
  const envelope = await env.SNAPSHOTS.get('snapshot', 'json');
  if (!isPrecomputedEnvelope(envelope)) throw new Error('Invalid fixture');
  return new Response(JSON.stringify(envelope.payload));
}
async function readResponse(mode: string, env: LocalEnv): Promise<Response> {
  const reader = mode === '/cold' ? createPrecomputedResponseReader() : read;
  const response =
    mode === '/baseline'
      ? await baseline(env)
      : await reader(env.SNAPSHOTS, 'snapshot', 'tarkov-tasks-core-en-regular');
  if (!response) throw new Error('Missing fixture');
  return response;
}
async function runIterations(mode: string, env: LocalEnv, iterations: number): Promise<string> {
  let body = '';
  for (let i = 0; i < iterations; i++) body = await (await readResponse(mode, env)).text();
  return body;
}
export default {
  async fetch(request: Request, env: LocalEnv): Promise<Response> {
    const url = new URL(request.url);
    const iterations = Math.min(30, Number(url.searchParams.get('iterations')) || 1);
    const body = await runIterations(url.pathname, env, iterations);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
    const sha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');
    return Response.json({ iterations, bytes: new TextEncoder().encode(body).byteLength, sha256 });
  },
};
