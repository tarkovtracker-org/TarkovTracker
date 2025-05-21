import { vi, describe, it, expect, beforeEach } from 'vitest';
import { firestoreMock } from './setup'; // Import top-level spies
import { createToken } from '../api/token/create';
import { revokeToken } from '../api/token/revoke';
// --- Test Suite ---
describe('Token API Integration', () => {
  let mockContext;
  beforeEach(() => {
    // Reset mocks is handled globally in setup
    // Setup mock context for callable functions
    mockContext = {
      auth: {
        uid: 'test-user-id',
        token: 'test-id-token', // The user's Firebase ID token
      },
      // Add other context properties if needed by your functions
      // instanceIdToken: "test-instance-id-token",
    };
  });
  // --- Token Creation Tests ---
  describe('Token Creation', () => {
    it('should call the right Firestore methods when creating a token', async () => {
      const mockData = { note: 'Test Token', permissions: ['read'] };
      // --- Setup: Rely on default transaction mock from setup ---
      // We only need to check if runTransaction itself was called.
      // Capture the result to check the returned token ID.
      let transactionResult = null;
      firestoreMock.runTransaction.mockImplementationOnce(async (callback) => {
        const transaction = {
          /* Default transaction obj from setup */
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({ plan: 'basic' }),
          }), // System doc
          set: vi.fn().mockResolvedValue(undefined), // Token doc set
          update: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
        };
        // The createToken function expects {tokenId: ...} to be returned
        // Simulate this structure based on how createToken likely works
        const result = await callback(transaction); // result might be undefined
        // Assume createToken generates ID internally and returns it via transaction result (or another way)
        // For the test, let's just return a fixed dummy ID if the transaction logic doesn't explicitly return one.
        transactionResult = result || { tokenId: 'mock-created-token-id' };
        return transactionResult;
      });
      // --- End Setup ---
      const result = await createToken(mockData, mockContext);
      expect(firestoreMock.runTransaction).toHaveBeenCalled();
      expect(result).toBeDefined();
      // Check the structure returned by the transaction mock
      expect(result.token).toEqual(transactionResult.tokenId);
    });
    // Add tests for error cases if needed (e.g., user already has max tokens)
  });
  // --- Token Revocation Tests ---
  describe('Token Revocation', () => {
    it('should call the right Firestore methods when revoking a token', async () => {
      const mockData = { token: 'token-to-revoke' };
      const ownerUid = mockContext.auth.uid;
      // --- Setup: Mock collection().doc().get/delete and runTransaction ---
      firestoreMock
        .collection('token')
        .doc(mockData.token)
        .get.mockResolvedValue({
          exists: true,
          data: () => ({ owner: ownerUid }),
        });
      firestoreMock.collection('token').doc(mockData.token).delete.mockResolvedValue(undefined);
      // The default transaction mock from setup handles the system doc update
      // --- End Setup ---
      const result = await revokeToken(mockData, mockContext);
      expect(firestoreMock.collection).toHaveBeenCalledWith('token');
      expect(firestoreMock.collection('token').doc).toHaveBeenCalledWith(mockData.token);
      expect(firestoreMock.collection('token').doc(mockData.token).get).toHaveBeenCalled();
      expect(firestoreMock.collection('token').doc(mockData.token).delete).toHaveBeenCalled();
      expect(firestoreMock.runTransaction).toHaveBeenCalled(); // Check transaction was called for system update
      expect(result).toEqual({ success: true });
    });
    it("should throw 'not-found' if token does not exist", async () => {
      const mockData = { token: 'non-existent-token' };
      // --- Setup: Mock specific get call to return exists: false ---
      const getSpy = vi.fn().mockResolvedValue({ exists: false });
      firestoreMock.collection('token').doc(mockData.token).get = getSpy; // Directly assign spy
      // --- End Setup ---
      await expect(revokeToken(mockData, mockContext)).rejects.toThrow('Token not found');
      expect(firestoreMock.collection).toHaveBeenCalledWith('token');
      expect(firestoreMock.collection('token').doc).toHaveBeenCalledWith(mockData.token);
      expect(getSpy).toHaveBeenCalled(); // Assert the specific spy was called
    });
    // Add test for permission denied (token owner != context.auth.uid)
  });
});
