import functions from "firebase-functions"; // Use import
import admin from "firebase-admin"; // Use import

// Core logic extracted into a separate, testable function
async function _revokeTokenLogic(data, context) {
  const db = admin.firestore();
  functions.logger.log("Starting revoke token logic", {
    data: data,
    owner: context?.auth?.uid, // Safe navigation
  });

  // Basic validation
  if (!context?.auth?.uid) {
    functions.logger.error("Authentication context missing.");
    throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  if (!data.token) {
    functions.logger.warn("Invalid revoke parameters: token is required.", { data });
    throw new functions.https.HttpsError('invalid-argument', 'Invalid token parameters: token is required.');
  }

  const systemRef = db.collection("system").doc(context.auth.uid);
  const tokenRef = db.collection("token").doc(data.token);

  // Run a transaction to revoke the token
  try {
    await db.runTransaction(async (transaction) => {
      const tokenDoc = await transaction.get(tokenRef);
      const systemDoc = await transaction.get(systemRef); // Get system doc within transaction

      if (!tokenDoc.exists) {
        functions.logger.warn("Attempted to revoke non-existent token.", {
          owner: context.auth.uid,
          token: data.token,
        });
        throw new functions.https.HttpsError('not-found', 'Token not found.');
      }

      const tokenData = tokenDoc.data();
      if (tokenData.owner !== context.auth.uid) {
        functions.logger.warn("Permission denied to revoke token.", {
          owner: context.auth.uid,
          tokenOwner: tokenData.owner,
          token: data.token,
        });
        throw new functions.https.HttpsError('permission-denied', 'You do not have permission to revoke this token.');
      }

      // Delete the token document
      transaction.delete(tokenRef);

      // Remove the token from the user's system document
      if (systemDoc.exists) {
        transaction.update(systemRef, {
          tokens: admin.firestore.FieldValue.arrayRemove(data.token),
        });
      } else {
        // This case should ideally not happen if a user has tokens, but handle defensively
        functions.logger.warn("System document not found for user while revoking token.", {
            owner: context.auth.uid,
            token: data.token,
        });
      }
    });

    functions.logger.log("Revoked token successfully", {
      owner: context.auth.uid,
      token: data.token,
    });
    return { revoked: true };

  } catch (e) {
    functions.logger.error("Failed to revoke token transaction", {
      owner: context.auth.uid,
      token: data.token,
      error: e.message || e.toString(),
      code: e.code,
      details: e.details,
    });
    // Re-throw HttpsErrors or wrap other errors
    if (e instanceof functions.https.HttpsError) {
        throw e;
    } else {
        // Provide a more generic internal error message
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred during token revocation.');
    }
  }
}

// Export the wrapped function for Firebase deployment using ESM export
const revokeToken = functions.https.onCall(_revokeTokenLogic);
export { revokeToken, _revokeTokenLogic }; // Export both wrapped and logic function
