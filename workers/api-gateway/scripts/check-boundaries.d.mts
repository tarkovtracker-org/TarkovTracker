export function inspectImports(
  source: string,
  file: string,
  root: string,
  allowed: (specifier: string) => boolean
): string[];
export function checkBoundaries(gatewayRoot: string): string[];
