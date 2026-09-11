/**
 * Stubs window.localStorage with a throwing mock to test failure branches
 * without mutating or leaking across happy-dom's shared Proxy.
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
    }
  };
};
