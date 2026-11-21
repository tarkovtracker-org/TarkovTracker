import { defineEventHandler } from 'h3';
import { serveProfileShell } from '@/server/utils/serveProfileShell';
import { isPublicProfileShellPath } from '@/utils/profileShell';
export default defineEventHandler((event) =>
  serveProfileShell(event, (path) => path === '/profile/' || isPublicProfileShellPath(path))
);
