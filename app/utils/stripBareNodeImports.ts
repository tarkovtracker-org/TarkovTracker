const BARE_NODE_IMPORT_RE = /import\s*["']node:[^"']+["']\s*;?/g;
export const stripBareNodeImports = (source: string): string => {
  if (!source.includes('node:')) {
    return source;
  }
  return source.replace(BARE_NODE_IMPORT_RE, '');
};
