const hasSelectValue = (value: unknown): value is { value: unknown } =>
  value !== null && typeof value === 'object' && 'value' in value;
export const readSelectValue = (value: unknown): unknown =>
  typeof value === 'string' ? value : hasSelectValue(value) ? value.value : null;
