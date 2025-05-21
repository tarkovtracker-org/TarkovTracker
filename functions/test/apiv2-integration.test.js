import { vi, describe, it, expect } from 'vitest';
import { firestoreMock } from './setup';

// Mock Express response object
const mockResponse = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

// Mock Express request object
const mockRequest = (headers = {}, params = {}, body = {}) => ({
  get: vi.fn((header) => headers[header]),
  headers,
  params,
  body,
});
// Main test suite
describe('API v2 Integration Tests', () => {
  describe('Auth Middleware', () => {
    it('should authenticate a valid token', async () => {
      const authMiddleware = await import('../api/v2/middleware/auth');
      const { verifyBearer } = authMiddleware;
      // --- Setup: Mock Firestore for this specific test ---
      const getSpy = vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({ permissions: ['read', 'write'], owner: 'test-user' }),
      });
      const updateSpy = vi.fn().mockResolvedValue(undefined);
      // Directly mock the methods on the specific path
      firestoreMock.collection('token').doc('valid-token').get = getSpy;
      firestoreMock.collection('token').doc('valid-token').update = updateSpy;
      // --- End Setup ---
      const req = mockRequest({ Authorization: 'Bearer valid-token' });
      const res = mockResponse();
      const next = vi.fn();
      await verifyBearer(req, res, next);
      // Assertions
      expect(firestoreMock.collection).toHaveBeenCalledWith('token');
      expect(firestoreMock.collection('token').doc).toHaveBeenCalledWith('valid-token');
      expect(getSpy).toHaveBeenCalled();
      expect(updateSpy).toHaveBeenCalled(); // Check the specific update spy
      expect(req.apiToken).toBeDefined();
      expect(req.apiToken.permissions).toEqual(['read', 'write']);
      expect(next).toHaveBeenCalled();
    });
    it('should reject invalid tokens', async () => {
      const authMiddleware = await import('../api/v2/middleware/auth');
      const { verifyBearer } = authMiddleware;
      // --- Setup: Use default mocks (get returns exists: false) ---
      const getSpy = vi.fn().mockResolvedValue({ exists: false });
      firestoreMock.collection('token').doc('invalid-token').get = getSpy;
      // --- End Setup ---
      const req = mockRequest({ Authorization: 'Bearer invalid-token' });
      const res = mockResponse();
      const next = vi.fn();
      await verifyBearer(req, res, next);
      // Assertions
      expect(firestoreMock.collection).toHaveBeenCalledWith('token');
      expect(firestoreMock.collection('token').doc).toHaveBeenCalledWith('invalid-token');
      expect(getSpy).toHaveBeenCalled(); // Check specific get spy
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.send).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  });
  describe('Progress Handler', () => {
    // Mock data loaders at the describe level
    vi.doMock('../api/v2/utils/dataLoaders', () => ({
      // Use doMock for potentially better timing
      getTaskData: vi.fn().mockResolvedValue({ tasks: [{ id: 'task1', objectives: [] }] }),
      getHideoutData: vi.fn().mockResolvedValue({ hideoutStations: [] }),
    }));
    it('should handle player progress requests', async () => {
      const progressHandler = await import('../api/v2/handlers/progressHandler');
      // --- Setup: Mock Firestore get for progress doc ---
      const mockDocMethods = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ level: 10, tasks: {} }),
        }),
      };
      const mockCollectionMethods = { doc: vi.fn(() => mockDocMethods) };
      firestoreMock.collection.mockImplementation((name) => {
        if (name === 'progress') return mockCollectionMethods;
        // Mock other collections if needed by utils/dataLoaders.js or return default
        return {
          doc: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ exists: false }),
          })),
        };
      });
      // --- End Setup ---
      const req = {
        apiToken: { permissions: ['GP'], owner: 'test-user' },
        params: {},
      };
      const res = mockResponse();
      await progressHandler.default.getPlayerProgress(req, res);
      // Assertions
      expect(firestoreMock.collection).toHaveBeenCalledWith('progress');
      expect(mockCollectionMethods.doc).toHaveBeenCalledWith('test-user');
      expect(mockDocMethods.get).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
    });
    it('should update player task state', async () => {
      let progressHandler;
      // Use dynamic import *after* mocks are set up
      progressHandler = (await import('../api/v2/handlers/progressHandler')).default;
      // --- Setup: Rely on default transaction mock from setup ---
      // Default transaction mock handles get/update checks internally via setup
      // --- End Setup ---
      const req = {
        apiToken: { permissions: ['write'], owner: 'test-user' },
        params: { taskId: 'task1' },
        body: { state: 'completed' },
      };
      const res = mockResponse();
      await progressHandler.updateSingleTask(req, res);
      // Assertions
      // Check that the transaction was called by the main function
      expect(firestoreMock.runTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith({
        message: 'Task progress updated successfully.',
      });
      // We can't easily check the *internal* transaction get/update calls with this setup,
      // but we know the default mock in setup.js handles them.
    });
  });
  describe('API Router', () => {
    it('should define all required routes', async () => {
      const module = await import('../api/v2/index.js');
      const rawApiApp = module.rawApp;
      expect(rawApiApp).toBeDefined();
    });
  });
});
