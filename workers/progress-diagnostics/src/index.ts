import { readProgressDiagnosticBody } from '@/server/utils/progressDiagnosticBody';
import { sanitizeProgressDiagnostic } from '@/utils/progressDiagnosticEvent';
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    try {
      const input = await readProgressDiagnosticBody(request.body);
      const payload = sanitizeProgressDiagnostic(input);
      console.log(payload);
      return new Response(null, { status: 204 });
    } catch {
      return new Response(null, { status: 400 });
    }
  },
};
