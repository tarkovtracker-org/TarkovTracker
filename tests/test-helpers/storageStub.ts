/**
 * Stubs localStorage getItem/setItem failures for theme persistence tests without
 * mutating happy-dom's shared Proxy. Other operations stay inert so test-environment
 * cleanup can clear storage; this does not simulate denial of the entire Storage API.
 */
export const installThrowingStorageStub = (
  errorMessage: string = 'SecurityError: Access is denied for this document'
): (() => void) => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return 0;
      },
      clear() {},
      getItem(): string | null {
        throw new Error(errorMessage);
      },
      key: () => null,
      removeItem() {},
      setItem(): void {
        throw new Error(errorMessage);
      },
    } satisfies Storage,
  });
  return () => {
    if (originalDescriptor) {
      Object.defineProperty(window, 'localStorage', originalDescriptor);
    } else {
      Reflect.deleteProperty(window, 'localStorage');
    }
  };
};
