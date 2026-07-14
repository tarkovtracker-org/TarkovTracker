// Deno global namespace stub for VS Code TypeScript
declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined
    set(key: string, value: string): void
    delete(key: string): void
    toObject(): Record<string, string>
  }
  export const env: Env

  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
    options?: { port?: number; hostname?: string }
  ): void
}

declare module "shared/auth" {
  export function authenticateUser(req: Request): Promise<{ user: { id: string }; supabase: unknown } | { error: string; status: number }>
  export function handleCorsPreflight(req: Request): Response | null
  export function validateMethod(req: Request, allowed: string[]): Response | null
  export function createErrorResponse(error: string | Error, status?: number, req?: Request): Response
  export function createSuccessResponse(data: unknown, status?: number, req?: Request): Response
}
