// Common mocks for tests
import { vi } from 'vitest';

// Create transaction mock that properly resolves promises
export const createTransactionMock = () => ({
  get: vi.fn().mockImplementation(() => {
    return Promise.resolve({
      exists: false,
      data: () => ({ tokens: [] }),
    });
  }),
  set: vi.fn().mockResolvedValue({}),
  update: vi.fn().mockResolvedValue({}),
  delete: vi.fn().mockResolvedValue({}),
});

// Create a firestore mock with chainable methods
export const createFirestoreMock = () => {
  // Create a document snapshot mock
  const createDocumentSnapshotMock = (data = {}, exists = true) => ({
    exists,
    data: () => data,
    id: 'mock-doc-id',
    ref: {
      id: 'mock-doc-id',
      collection: vi.fn().mockImplementation((name) => createCollectionRefMock(name)),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
  });

  // Create a base mock object
  const firestoreMock = {
    collection: vi.fn(),
    doc: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    get: vi.fn().mockResolvedValue(createDocumentSnapshotMock()),
    set: vi.fn().mockResolvedValue({}),
    add: vi.fn().mockResolvedValue({ id: 'mock-doc-id' }),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    runTransaction: vi.fn(),
  };

  // Create a document reference mock that tracks its own calls
  const createDocRefMock = (_path) => {
    const docRef = {
      get: vi.fn().mockImplementation(() => {
        firestoreMock.get();
        return Promise.resolve(createDocumentSnapshotMock());
      }),
      set: vi.fn().mockImplementation((data) => {
        firestoreMock.set(data);
        return Promise.resolve({});
      }),
      update: vi.fn().mockImplementation((data) => {
        firestoreMock.update(data);
        return Promise.resolve({});
      }),
      delete: vi.fn().mockImplementation(() => {
        firestoreMock.delete();
        return Promise.resolve({});
      }),
      collection: vi.fn().mockImplementation((name) => {
        firestoreMock.collection(name);
        return createCollectionRefMock(name);
      }),
    };
    return docRef;
  };

  // Create a collection reference mock that tracks its own calls
  const createCollectionRefMock = (name) => {
    const collectionRef = {
      doc: vi.fn().mockImplementation((id) => {
        firestoreMock.doc(`${name}/${id}`);
        return createDocRefMock(`${name}/${id}`);
      }),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockImplementation(() => {
        firestoreMock.get();
        return Promise.resolve({
          docs: [createDocumentSnapshotMock()],
          empty: false,
          size: 1,
        });
      }),
    };
    return collectionRef;
  };

  // Set up the main collection method to return the collection reference
  firestoreMock.collection.mockImplementation((name) => {
    return createCollectionRefMock(name);
  });

  // Set up the main doc method to return the document reference
  firestoreMock.doc.mockImplementation((path) => {
    return createDocRefMock(path);
  });

  // Set up transaction mock
  const transactionMock = createTransactionMock();
  firestoreMock.runTransaction.mockImplementation(async (callback) => {
    return callback(transactionMock);
  });

  return { firestoreMock, transactionMock };
};

// Mock for firebase-admin
export const createFirebaseAdminMock = () => {
  // Create the firestore mock
  const { firestoreMock, transactionMock } = createFirestoreMock();

  // Create the firestore function that returns the firestoreMock
  const firestoreFunction = vi.fn().mockReturnValue(firestoreMock);

  // Add static properties
  firestoreFunction.FieldValue = {
    serverTimestamp: vi.fn().mockReturnValue('serverTimestamp'),
    arrayUnion: vi.fn((item) => `arrayUnion(${item})`),
    arrayRemove: vi.fn((item) => `arrayRemove(${item})`),
    delete: vi.fn().mockReturnValue('delete()'),
    increment: vi.fn((value) => `increment(${value})`),
  };

  firestoreFunction.Timestamp = {
    now: vi.fn().mockReturnValue('now'),
    fromDate: vi.fn((date) => ({ toDate: () => date })),
  };

  // Create the admin mock with all required properties
  const adminMock = {
    initializeApp: vi.fn(),
    firestore: firestoreFunction,
    auth: vi.fn().mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue({ uid: 'test-user' }),
      createCustomToken: vi.fn().mockResolvedValue('test-custom-token'),
    }),
  };

  return { adminMock, firestoreMock, transactionMock };
};

// Mock for firebase-functions
export const createFirebaseFunctionsMock = () => {
  return {
    config: vi.fn().mockReturnValue({}),
    https: {
      HttpsError: class HttpsError extends Error {
        constructor(code, message) {
          super(message || 'Error during test');
          this.code = code;
        }
      },
      onCall: vi.fn((handler) => handler),
      onRequest: vi.fn((handler) => handler),
    },
    handler: {
      https: {
        onRequest: vi.fn((handler) => handler),
      },
    },
    schedule: vi.fn(() => ({
      onRun: vi.fn((handler) => handler),
    })),
    logger: {
      log: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  };
};
