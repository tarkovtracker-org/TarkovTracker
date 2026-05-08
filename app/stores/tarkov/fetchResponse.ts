export type FetchSuccess<T> = { data: T };
export type FetchError = { error: string | Record<string, unknown> };
export type FetchResponse<T> = FetchSuccess<T> | FetchError;
export const isFetchError = (value: unknown): value is FetchError => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!Object.prototype.hasOwnProperty.call(value, 'error')) return false;
  const error = (value as { error?: unknown }).error;
  return (
    typeof error === 'string' ||
    (error !== null && typeof error === 'object' && !Array.isArray(error))
  );
};
export const isFetchSuccess = <T>(value: unknown): value is FetchSuccess<T> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.prototype.hasOwnProperty.call(value, 'error')) return false;
  return Object.prototype.hasOwnProperty.call(value, 'data');
};
