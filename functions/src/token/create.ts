import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import admin from 'firebase-admin';
import UIDGenerator from 'uid-generator';
import {
  Firestore,
  DocumentReference,
  DocumentSnapshot,
  Transaction,
  CollectionReference,
} from 'firebase-admin/firestore';
interface CreateTokenData {
  note: string;
  permissions: string[];
}
interface SystemDocData {
  tokens?: string[];
}
interface TokenDocData {
  owner: string;
  note: string;
  permissions: string[];
  createdAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
}
// Core logic extracted into a separate, testable function
async function _createTokenLogic(
  request: CallableRequest<CreateTokenData>
): Promise<{ token: string }> {
  const db: Firestore = admin.firestore();
  const ownerUid = request.auth?.uid;
  logger.log('Starting create token logic (v2)', {
    data: request.data,
    owner: ownerUid,
  });
  if (!ownerUid) {
    logger.error('Authentication context missing.');
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  if (
    request.data.note == null ||
    !request.data.permissions ||
    !(request.data.permissions.length > 0)
  ) {
    logger.warn('Invalid token parameters received.', { data: request.data });
    throw new HttpsError(
      'invalid-argument',
      'Invalid token parameters: note and permissions array are required.'
    );
  }
  const systemRef: DocumentReference<SystemDocData> = db
    .collection('system')
    .doc(ownerUid) as DocumentReference<SystemDocData>;
  const tokenCollectionRef: CollectionReference<TokenDocData> = db.collection(
    'token'
  ) as CollectionReference<TokenDocData>;
  try {
    let generatedToken = '';
    await db.runTransaction(async (transaction: Transaction) => {
      const systemDoc: DocumentSnapshot<SystemDocData> = await transaction.get(systemRef);
      const systemData = systemDoc.data();
      // Check if the user already has the maximum number of tokens
      if (systemData?.tokens && systemData.tokens.length >= 5) {
        throw new HttpsError('resource-exhausted', 'You have the maximum number of tokens (5).');
      }
      let tokenExists = true;
      let attempts = 0;
      const uidgen = new UIDGenerator(128);
      let potentialToken = '';
      let potentialTokenRef: DocumentReference<TokenDocData>;
      while (tokenExists && attempts < 5) {
        potentialToken = await uidgen.generate();
        potentialTokenRef = tokenCollectionRef.doc(potentialToken);
        const existingTokenDoc: DocumentSnapshot = await transaction.get(potentialTokenRef);
        tokenExists = existingTokenDoc.exists;
        attempts++;
      }
      if (tokenExists) {
        logger.error('Failed to generate a unique token after multiple attempts.', {
          owner: ownerUid,
        });
        throw new HttpsError('internal', 'Failed to generate a unique token.');
      }
      generatedToken = potentialToken;
      const newTokenData: TokenDocData = {
        owner: ownerUid,
        note: request.data.note,
        permissions: request.data.permissions,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      transaction.set(potentialTokenRef!, newTokenData);
      if (systemDoc.exists) {
        transaction.update(systemRef, {
          tokens: admin.firestore.FieldValue.arrayUnion(generatedToken),
        });
      } else {
        // If the system document doesn't exist, create it with the new token
        const newSystemData: SystemDocData = {
          tokens: [generatedToken],
        };
        transaction.set(systemRef, newSystemData);
      }
    });
    logger.log('Created token successfully (v2)', {
      owner: ownerUid,
      token: generatedToken,
    });
    return { token: generatedToken };
  } catch (e: unknown) {
    let errorMessage = 'Unknown error';
    let errorCode = 'internal';
    let errorDetails: unknown | undefined = undefined;
    if (e instanceof HttpsError) {
      errorMessage = e.message;
      errorCode = e.code;
      errorDetails = e.details;
    } else if (e instanceof Error) {
      errorMessage = e.message;
    } else if (typeof e === 'string') {
      errorMessage = e;
    }
    logger.error('Failed to create token transaction (v2)', {
      owner: ownerUid,
      error: errorMessage,
      code: errorCode,
      details: errorDetails,
      originalError: e,
    });
    if (e instanceof HttpsError) {
      throw e;
    } else {
      throw new HttpsError(
        'internal',
        'An unexpected error occurred during token creation.',
        errorMessage
      );
    }
  }
}
export const createToken = onCall(_createTokenLogic);
