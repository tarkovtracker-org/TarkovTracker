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
