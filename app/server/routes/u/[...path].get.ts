import { defineEventHandler } from 'h3';
import { serveProfileShell } from '@/server/utils/serveProfileShell';
import { isHandleProfileShellPath } from '@/utils/profileShell';
export default defineEventHandler((event) => serveProfileShell(event, isHandleProfileShellPath));
