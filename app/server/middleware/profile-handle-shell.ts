import { defineEventHandler } from 'h3';
import { serveProfileShell } from '@/server/utils/serveProfileShell';
import { isHandleProfileShellPath } from '@/utils/profileShell';
export default defineEventHandler((event) => {
  // Match the literal handle prefix before the SPA renderer without a catch-all route.
  if (!event.path.startsWith('/@')) return;
  if (event.method !== 'GET' && event.method !== 'HEAD') return;
  return serveProfileShell(event, isHandleProfileShellPath);
});
