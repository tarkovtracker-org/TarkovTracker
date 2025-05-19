import functions from 'firebase-functions';
import admin from 'firebase-admin';
import { Request, Response, NextFunction } from 'express';
import { Firestore, DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';

// Define minimal interface for the token document data expected
// Duplicated from index.ts for simplicity, consider shared types for larger projects
interface ApiTokenData {
  owner: string;
  note: string;
  permissions: string[];
  calls?: number;
  createdAt?: admin.firestore.Timestamp;
}
// Define interface for the apiToken added to the request
interface ApiToken extends ApiTokenData {
  token: string;
}
// Extend the Express Request interface to include apiToken
interface AuthenticatedRequest extends Request {
  apiToken?: ApiToken;
}
const verifyBearer = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const db: Firestore = admin.firestore();
  const authHeader = req.get('Authorization');
  if (authHeader == null) {
    res.status(401).json({ error: 'No Authorization header sent' });
    return;
  }
  try {
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      res.status(400).json({
        error: "Invalid Authorization header format. Expected 'Bearer <token>'.",
      });
      return;
    }
    const authToken: string = parts[1];
    const tokenRef: DocumentReference<ApiTokenData> = db
      .collection('token')
      .doc(authToken) as DocumentReference<ApiTokenData>;
    const tokenDoc: DocumentSnapshot<ApiTokenData> = await tokenRef.get();
    if (tokenDoc.exists) {
      const tokenData = tokenDoc.data();
      if (!tokenData) {
        functions.logger.error('Token document exists but data is undefined', {
          token: authToken,
        });
        res.status(500).json({ error: 'Internal server error reading token data.' });
        return;
      }
      functions.logger.log('Found Token', { token: tokenData });
      req.apiToken = { ...tokenData, token: authToken };
      const callIncrement = admin.firestore.FieldValue.increment(1);
      tokenRef.update({ calls: callIncrement }).catch((err: unknown) => {
        functions.logger.error('Failed to increment token calls', {
          error: err instanceof Error ? err.message : err,
          token: authToken,
        });
      });
      next();
    } else {
      functions.logger.log('Did not find token', { token: authToken });
      res.status(401).json({ error: 'Invalid or expired token.' });
    }
  } catch (error: unknown) {
    functions.logger.error('Error during token verification:', {
      authHeader: authHeader,
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: 'Internal server error during authentication.' });
  }
};
export { verifyBearer };
