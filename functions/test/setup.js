import { vi, beforeEach } from 'vitest';
// --- Mocks ---
const adminMock = { initializeApp: vi.fn() }; // Simpler admin mock
// Basic Firestore spies (tests will provide implementations)
const firestoreMock = {
  collection: vi.fn(),
  doc: vi.fn(),
  runTransaction: vi.fn(),
  FieldValue: {
    // Keep FieldValue for convenience
    serverTimestamp: vi.fn().mockReturnValue('serverTimestamp'),
    arrayUnion: vi.fn((item) => `arrayUnion(${item})`),
    arrayRemove: vi.fn((item) => `arrayRemove(${item})`),
    increment: vi.fn((value) => `increment(${value})`),
    delete: vi.fn().mockReturnValue('delete()'),
  },
  Timestamp: {
    // Keep Timestamp
    now: vi.fn().mockReturnValue('now'),
    fromDate: vi.fn((date) => ({ toDate: () => date })),
  },
};
const functionsMock = {
  // Basic structure
  config: vi.fn().mockReturnValue({}),
  https: {
    onRequest: vi.fn((handler) => handler), // Return handler for testing
    onCall: vi.fn((handler) => handler),
    HttpsError: class HttpsError extends Error {
      // Keep HttpsError
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    },
  },
  logger: {
    // Keep logger
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  pubsub: {
    // Keep basic pubsub structure
    schedule: vi.fn(() => ({
      // Return an object with chainable methods
      timeZone: vi.fn().mockReturnThis(),
      onRun: vi.fn((handler) => handler), // Return handler
    })),
  },
};
// --- Mock Factories ---
vi.mock('firebase-admin', () => {
  const admin = {
    ...adminMock,
    // firestore() returns the basic object with spies
    firestore: vi.fn(() => firestoreMock),
    // Basic auth mock (tests might need to enhance this)
    auth: vi.fn(() => ({
      verifyIdToken: vi.fn().mockResolvedValue({ uid: 'test-user' }),
      createCustomToken: vi.fn().mockResolvedValue('test-custom-token'),
    })),
    credential: { cert: vi.fn() },
  };
  admin.default = admin;
  return { default: admin, admin };
});
// Mock both v1 and default functions paths
vi.mock('firebase-functions', () => ({
  ...functionsMock,
  default: functionsMock,
}));
vi.mock('firebase-functions/v1', () => ({
  ...functionsMock,
  default: functionsMock,
}));
// --- Global Hooks ---
beforeEach(() => {
  // Reset all mocks provided by vitest vi.fn()
  vi.clearAllMocks();
  // --- Reset specific mock implementations/return values ---
  // Reset top-level Firestore spies to basic chainable mocks
  // This ensures tests start with a consistent baseline
  const mockDocMethods = {
    get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    collection: vi.fn(() => mockCollectionMethods), // Chain back to collection
  };
  const mockCollectionMethods = {
    doc: vi.fn(() => mockDocMethods),
    get: vi.fn().mockResolvedValue({ docs: [], empty: true, size: 0 }),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  firestoreMock.collection.mockImplementation(() => mockCollectionMethods);
  firestoreMock.doc.mockImplementation(() => mockDocMethods);
  // Reset transaction mock to provide basic spied methods
  firestoreMock.runTransaction.mockImplementation(async (callback) => {
    const transaction = {
      get: vi.fn().mockImplementation((docRef) => {
        if (docRef?.path?.startsWith('system/')) {
          return Promise.resolve({
            exists: true,
            data: () => ({ tokens: [] }),
          });
        }
        return Promise.resolve({ exists: false, data: () => ({}) });
      }),
      set: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    return callback(transaction);
  });
});
console.log('functions/test/setup loaded (SIMPLIFIED mocks)');
// --- Explicit Exports ---
export { adminMock, firestoreMock, functionsMock };
