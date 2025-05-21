// Firebase mocks for testing
import { vi } from 'vitest';

// Create a transaction mock
export const createTransactionMock = () => ({
  get: vi.fn().mockImplementation(() => {
    return Promise.resolve({
      exists: false,
      data: vi.fn().mockReturnValue({ tokens: [] }),
    });
  }),
  set: vi.fn().mockResolvedValue({}),
  update: vi.fn().mockResolvedValue({}),
  delete: vi.fn().mockResolvedValue({}),
});

// Create a chainable firestore mock
export const createFirestoreMock = () => {
  // Create a base mock object that returns itself for chaining
  const mock = {};

  // Define chainable methods
  mock.collection = vi.fn().mockReturnValue(mock);
  mock.doc = vi.fn().mockReturnValue(mock);
  mock.where = vi.fn().mockReturnValue(mock);
  mock.orderBy = vi.fn().mockReturnValue(mock);
  mock.limit = vi.fn().mockReturnValue(mock);

  // Define non-chainable methods
  mock.get = vi.fn().mockResolvedValue({
    exists: false,
    data: vi.fn().mockReturnValue({}),
  });

  // Add transaction support
  const transactionMock = createTransactionMock();
  mock.runTransaction = vi.fn().mockImplementation(async (callback) => {
    return callback(transactionMock);
  });

  // Add other methods
  mock.set = vi.fn().mockResolvedValue({});
  mock.update = vi.fn().mockResolvedValue({});
  mock.delete = vi.fn().mockResolvedValue({});

  return {
    firestoreMock: mock,
    transactionMock,
  };
};

// Create Firebase Admin mock
export const createFirebaseAdminMock = () => {
  const { firestoreMock, transactionMock } = createFirestoreMock();

  // Create the Firebase admin mock with firestore as a function
  const firestoreFunction = vi.fn().mockReturnValue(firestoreMock);

  // Add FieldValue and Timestamp as properties to the function
  firestoreFunction.FieldValue = {
    serverTimestamp: vi.fn().mockReturnValue('server-timestamp'),
    arrayUnion: vi.fn((item) => `array-union-${item}`),
    arrayRemove: vi.fn((item) => `array-remove-${item}`),
  };

  firestoreFunction.Timestamp = {
    now: vi.fn().mockReturnValue('timestamp-now'),
  };

  const adminMock = {
    initializeApp: vi.fn(),
    firestore: firestoreFunction,
    auth: vi.fn().mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue({ uid: 'test-user' }),
      createCustomToken: vi.fn().mockResolvedValue('custom-token'),
    }),
  };

  return { adminMock, firestoreMock, transactionMock };
};

// Create Firebase Functions mock
export const createFirebaseFunctionsMock = () => {
  return {
    https: {
      HttpsError: vi.fn((code, message) => {
        const error = new Error(message);
        error.code = code;
        return error;
      }),
      onCall: vi.fn((fn) => fn),
      onRequest: vi.fn((fn) => fn),
    },
    handler: {
      https: {
        onRequest: vi.fn((fn) => fn),
      },
    },
    logger: {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  };
};
