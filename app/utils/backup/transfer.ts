// Pull-based batches keep each structured-clone event small, including unusually long keys.
export const BACKUP_TRANSFER_TEXT = 8192;
export const BACKUP_TRANSFER_TOKENS = 64;
type Primitive = string | number | boolean | null;
export type BackupToken =
  | { op: 'object' | 'array' | 'end' }
  | { op: 'key' | 'text'; value: string; last: boolean }
  | { op: 'value'; value: Exclude<Primitive, string> };
function* textTokens(op: 'key' | 'text', text: string): Generator<BackupToken> {
  if (!text.length) yield { op, value: '', last: true };
  for (let offset = 0; offset < text.length; offset += BACKUP_TRANSFER_TEXT) {
    yield {
      op,
      value: text.slice(offset, offset + BACKUP_TRANSFER_TEXT),
      last: offset + BACKUP_TRANSFER_TEXT >= text.length,
    };
  }
}
const containerOp = (value: object): 'array' | 'object' =>
  Array.isArray(value) ? 'array' : 'object';
function* containerTokens(value: object): Generator<BackupToken> {
  yield { op: containerOp(value) };
  const array = Array.isArray(value);
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    if (!array) yield* textTokens('key', key);
    yield* backupTokens(child);
  }
  yield { op: 'end' };
}
export function* backupTokens(value: unknown): Generator<BackupToken> {
  if (typeof value === 'string') return yield* textTokens('text', value);
  if (value === null || typeof value !== 'object') {
    yield { op: 'value', value: value as Exclude<Primitive, string> };
    return;
  }
  yield* containerTokens(value);
}
const textLength = (token: BackupToken): number =>
  'value' in token && typeof token.value === 'string' ? token.value.length : 0;
export function readBackupBatch(tokens: Generator<BackupToken>): {
  tokens: BackupToken[];
  done: boolean;
} {
  const batch: BackupToken[] = [];
  let characters = 0;
  while (batch.length < BACKUP_TRANSFER_TOKENS && characters < BACKUP_TRANSFER_TEXT) {
    const next = tokens.next();
    if (next.done) return { tokens: batch, done: true };
    batch.push(next.value);
    characters += textLength(next.value);
  }
  return { tokens: batch, done: false };
}
type Container = Record<string, unknown> | unknown[];
export function createBackupReceiver() {
  let root: unknown;
  let text = '';
  const stack: { value: Container; key: string }[] = [];
  function append(value: unknown) {
    const parent = stack.at(-1);
    if (!parent) root = value;
    else if (Array.isArray(parent.value)) parent.value.push(value);
    else
      Object.defineProperty(parent.value, parent.key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
  }
  function acceptText(token: Extract<BackupToken, { op: 'text' | 'key' }>) {
    text += token.value;
    if (!token.last) return;
    if (token.op === 'key') stack.at(-1)!.key = text;
    else append(text);
    text = '';
  }
  function acceptContainer(op: 'object' | 'array' | 'end') {
    if (op === 'end') {
      stack.pop();
      return;
    }
    const value = op === 'array' ? [] : {};
    append(value);
    stack.push({ value, key: '' });
  }
  function accept(token: BackupToken) {
    if (token.op === 'value') {
      append(token.value);
      return;
    }
    if (token.op === 'text' || token.op === 'key') {
      acceptText(token);
      return;
    }
    acceptContainer(token.op);
  }
  return { accept: (tokens: BackupToken[]) => tokens.forEach(accept), value: () => root };
}
