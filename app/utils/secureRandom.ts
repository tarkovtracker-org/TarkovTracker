const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const UNBIASED_BYTE_LIMIT = 256 - (256 % ALPHANUMERIC.length);
const randomAlphanumericIndex = (): number => {
  const byte = new Uint8Array(1);
  do {
    crypto.getRandomValues(byte);
  } while (byte[0]! >= UNBIASED_BYTE_LIMIT);
  return byte[0]! % ALPHANUMERIC.length;
};
export const secureRandomAlphanumeric = (length: number): string =>
  Array.from({ length }, () => ALPHANUMERIC.charAt(randomAlphanumericIndex())).join('');
