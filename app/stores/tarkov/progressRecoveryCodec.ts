import { stringify, unflatten } from 'devalue';
import { ProgressRecoveryBundleError } from '@/stores/tarkov/progressRecoverySources';
export const progressRecoveryLimits = {
  characters: 8 * 1024 * 1024,
  nodes: 50_000,
  edges: 200_000,
  depth: 128,
  arrayLength: 10_000,
} as const;
const requireLimit = (valid: boolean): void => {
  if (!valid) throw new ProgressRecoveryBundleError('limit');
};
export const requireRecoveryTextLimit = (raw: string): void =>
  requireLimit(raw.length <= progressRecoveryLimits.characters);
const requireArrayLength = (length: unknown): void => {
  requireLimit(typeof length === 'number' && Number.isSafeInteger(length) && length >= 0);
  requireLimit((length as number) <= progressRecoveryLimits.arrayLength);
};
const arrayIndexKey = (key: string, length: number): boolean =>
  /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < length;
const arrayChildren = (value: unknown[]): unknown[] => {
  requireArrayLength(value.length);
  if (!Object.keys(value).every((key) => arrayIndexKey(key, value.length)))
    throw new ProgressRecoveryBundleError('unsupported');
  return Object.values(value);
};
const collectionChildren = (value: Map<unknown, unknown> | Set<unknown>): unknown[] => {
  requireNoNamedProperties(value);
  requireLimit(value.size <= progressRecoveryLimits.edges / 2);
  if (value instanceof Map) return Array.from(value.entries()).flat();
  return Array.from(value.values());
};
const objectChildren = (value: object): unknown[] => {
  if (Array.isArray(value)) return arrayChildren(value);
  if (value instanceof Map || value instanceof Set) return collectionChildren(value);
  return leafOrRecordChildren(value);
};
const leafOrRecordChildren = (value: object): unknown[] => {
  if (value instanceof Date) {
    requireNoNamedProperties(value);
    return [];
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new ProgressRecoveryBundleError('unsupported');
  return Object.values(value);
};
const requireNoNamedProperties = (value: object): void => {
  if (Object.keys(value).length !== 0) throw new ProgressRecoveryBundleError('unsupported');
};
/** Resource/loss checks only; devalue remains the codec. No type reducers or custom revivers. */
const checkExportGraph = (root: unknown): void => {
  const seen = new Set<object>();
  let edges = 0;
  let characters = 0;
  const checkText = (value: unknown) => {
    if (typeof value !== 'string') return;
    characters += value.length;
    requireLimit(characters <= progressRecoveryLimits.characters);
  };
  const visit = (value: unknown, depth: number): void => {
    checkText(value);
    if (value === null || typeof value !== 'object') return;
    if (seen.has(value)) return;
    requireLimit(depth <= progressRecoveryLimits.depth);
    seen.add(value);
    requireLimit(seen.size <= progressRecoveryLimits.nodes);
    const children = objectChildren(value);
    edges += children.length;
    requireLimit(edges <= progressRecoveryLimits.edges);
    children.forEach((child) => visit(child, depth + 1));
  };
  visit(root, 0);
};
const everyOther = (value: unknown[], start: number): unknown[] =>
  value.filter((_, index) => index >= start && (index - start) % 2 === 0);
// Pinned devalue 5.9.4 flattened-table layout: references only, not a second serializer.
const taggedReferences = (value: unknown[]): unknown[] => {
  if (value[0] === 'Set') return value.slice(1);
  if (value[0] === 'Map') return mapReferences(value);
  return nonCollectionReferences(value);
};
const mapReferences = (value: unknown[]): unknown[] => {
  if (value.length % 2 !== 1) throw new ProgressRecoveryBundleError('codec');
  return value.slice(1);
};
const nullRecordReferences = (value: unknown[]): unknown[] => {
  if (value.length % 2 !== 1) throw new ProgressRecoveryBundleError('codec');
  if (!everyOther(value, 1).every((key) => typeof key === 'string'))
    throw new ProgressRecoveryBundleError('codec');
  return everyOther(value, 2);
};
const nonCollectionReferences = (value: unknown[]): unknown[] => {
  if (value[0] === 'null') return nullRecordReferences(value);
  if (value[0] === 'Date') return dateReferences(value);
  throw new ProgressRecoveryBundleError('unsupported');
};
const dateReferences = (value: unknown[]): unknown[] => {
  if (value.length !== 2 || typeof value[1] !== 'string')
    throw new ProgressRecoveryBundleError('codec');
  requireLimit(value[1].length <= 32);
  return [];
};
const arrayReferences = (value: unknown[]): unknown[] => {
  if (typeof value[0] === 'string') return taggedReferences(value);
  if (value[0] === -7) {
    requireArrayLength(value[1]); // SPARSE=-7: [-7,length,index,reference,...].
    return everyOther(value, 3);
  }
  requireArrayLength(value.length);
  return value;
};
const nodeReferences = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return arrayReferences(value);
  if (value !== null && typeof value === 'object') return Object.values(value);
  return [];
};
const checkedReference = (value: unknown, nodeCount: number): number => {
  requireCodec(typeof value === 'number' && Number.isSafeInteger(value));
  requireCodec((value as number) >= -6 && (value as number) < nodeCount);
  return value as number;
};
const requireCodec = (valid: boolean): void => {
  if (!valid) throw new ProgressRecoveryBundleError('codec');
};
const checkTableDepth = (graph: number[][]): void => {
  const seen = new Set<number>();
  const visit = (index: number, depth: number): void => {
    if (index < 0 || seen.has(index)) return;
    requireLimit(depth <= progressRecoveryLimits.depth);
    seen.add(index);
    graph[index]!.forEach((child) => visit(child, depth + 1));
  };
  visit(0, 0);
};
const checkEncodedTable = (value: unknown): unknown[] => {
  requireLimit(Array.isArray(value) && value.length > 0);
  const table = value as unknown[];
  requireLimit(table.length <= progressRecoveryLimits.nodes);
  let edges = 0;
  const graph = table.map((node) => {
    const references = nodeReferences(node);
    edges += references.length;
    requireLimit(edges <= progressRecoveryLimits.edges);
    return references.map((index) => checkedReference(index, table.length));
  });
  checkTableDepth(graph);
  return table;
};
export const decodeRecoveryPayload = (raw: string): unknown => {
  requireRecoveryTextLimit(raw);
  try {
    const table = checkEncodedTable(JSON.parse(raw));
    return unflatten(table);
  } catch (error) {
    throwCodecError(error);
  }
};
const throwCodecError = (error: unknown): never => {
  if (error instanceof ProgressRecoveryBundleError) throw error;
  throw new ProgressRecoveryBundleError('codec');
};
export const encodeRecoveryPayload = (value: unknown): string => {
  checkExportGraph(value);
  try {
    const payload = stringify(value);
    decodeRecoveryPayload(payload); // Refuse lossy/unreadable exports without source mutation.
    return payload;
  } catch (error) {
    return throwCodecError(error);
  }
};
