import { describe, expect, it } from 'vitest';
import { literal } from './source-literal.mjs';
const evaluate = (source) => new Function(`return ${source};`)();
describe('literal', () => {
  const value = {
    script: '</script><script>alert(1)</script>',
    separators: 'a\u2028b\u2029c',
    quotes: 'say "hi" \\ done',
    controls: '\b\f\n\r\t\0',
    nested: [1, null, { path: '/a/b' }],
  };
  it('round-trips through evaluated source', () => {
    expect(evaluate(literal(value))).toEqual(value);
  });
  it('emits no characters that can close a script or string context', () => {
    expect(literal(value)).not.toMatch(/[<>/\u2028\u2029\n\r]/);
  });
});
