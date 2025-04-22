import * as logger from "firebase-functions/logger"; // Import v2 logger
import {
  onCall,
  HttpsError,
  CallableRequest,
} from "firebase-functions/v2/https"; // Import v2 onCall and types
import admin from "firebase-admin";
import {
  Firestore,
  DocumentReference,
  DocumentSnapshot,
  Transaction,
} from "firebase-admin/firestore";

// Define interfaces for data structures
interface RevokeTokenData {
  token: string;
}

interface SystemDocData {
  tokens?: string[];
  // Add other fields from system documents if known
}

interface TokenDocData {
  owner: string;
  // Add other fields from token documents if known
}

// Core logic extracted into a separate, testable function
async function _revokeTokenLogic(
  request: CallableRequest<RevokeTokenData>,
): Promise<{ revoked: boolean }> {
  const db: Firestore = admin.firestore();
  const ownerUid = request.auth?.uid;
  const data = request.data;
  logger.log("Starting revoke token logic (v2)", {
    data: data,
    owner: ownerUid,
  });
  if (!ownerUid) {
    logger.error("Authentication context missing.");
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }
  if (!data.token) {
    logger.warn("Invalid revoke parameters: token is required.", {
      data,
    });
    throw new HttpsError(
      "invalid-argument",
      "Invalid token parameters: token is required.",
    );
  }
  const systemRef: DocumentReference<SystemDocData> = db
    .collection("system")
    .doc(ownerUid) as DocumentReference<SystemDocData>;
  const tokenRef: DocumentReference<TokenDocData> = db
    .collection("token")
    .doc(data.token) as DocumentReference<TokenDocData>;
  try {
    await db.runTransaction(async (transaction: Transaction) => {
      const tokenDoc: DocumentSnapshot<TokenDocData> =
        await transaction.get(tokenRef);
      const systemDoc: DocumentSnapshot<SystemDocData> =
        await transaction.get(systemRef);
      if (!tokenDoc.exists) {
        logger.warn("Attempted to revoke non-existent token.", {
          owner: ownerUid,
          token: data.token,
        });
        throw new HttpsError("not-found", "Token not found.");
      }
      const tokenData = tokenDoc.data();
      if (tokenData?.owner !== ownerUid) {
        logger.warn("Permission denied to revoke token.", {
          owner: ownerUid,
          tokenOwner: tokenData?.owner,
          token: data.token,
        });
        throw new HttpsError(
          "permission-denied",
          "You do not have permission to revoke this token.",
        );
      }
      transaction.delete(tokenRef);
      if (systemDoc.exists) {
        transaction.update(systemRef, {
          tokens: admin.firestore.FieldValue.arrayRemove(data.token),
        });
      } else {
        logger.warn(
          "System document not found for user while revoking token.",
          {
            owner: ownerUid,
            token: data.token,
          },
        );
      }
    });
    logger.log("Revoked token successfully (v2)", {
      owner: ownerUid,
      token: data.token,
    });
    return { revoked: true };
  } catch (e: any) {
    logger.error("Failed to revoke token transaction (v2)", {
      owner: ownerUid,
      token: data.token,
      error: e.message || e.toString(),
      code: e.code,
      details: e.details,
    });
    if (e instanceof HttpsError) {
      throw e;
    } else {
      throw new HttpsError(
        "internal",
        "An unexpected error occurred during token revocation.",
      );
    }
  }
}

export const revokeToken = onCall(_revokeTokenLogic);
