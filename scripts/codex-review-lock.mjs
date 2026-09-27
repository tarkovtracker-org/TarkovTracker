import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
function createDirectory(path) {
  try {
    mkdirSync(path, { mode: 0o700 });
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}
function ownerOf(path) {
  try {
    return JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8'));
  } catch {
    return null;
  }
}
function validOwner(owner) {
  if (!owner || owner.host !== hostname()) return false;
  return validIdentity(owner);
}
function validIdentity(owner) {
  if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) return false;
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner.token);
}
function deadOwner(owner) {
  if (!validOwner(owner)) return false;
  try {
    process.kill(owner.pid, 0);
    return false;
  } catch (error) {
    return error.code === 'ESRCH';
  }
}
function ownDirectory(path) {
  if (!createDirectory(path)) return null;
  const token = randomUUID();
  writeFileSync(
    join(path, 'owner.json'),
    `${JSON.stringify({ pid: process.pid, host: hostname(), token })}\n`,
    { mode: 0o600, flag: 'wx' }
  );
  return token;
}
function recoverLock(path) {
  // Only one process may inspect/remove a dead owner's directory at a time.
  const recovery = `${path}.recovery`;
  if (!createDirectory(recovery)) return null;
  try {
    if (!deadOwner(ownerOf(path))) return null;
    rmSync(path, { recursive: true });
    return ownDirectory(path);
  } finally {
    rmSync(recovery, { recursive: true });
  }
}
export function acquireLock(path) {
  return ownDirectory(path) ?? recoverLock(path);
}
export function releaseLock(path, token) {
  if (ownerOf(path)?.token !== token) return;
  rmSync(path, { recursive: true });
}
