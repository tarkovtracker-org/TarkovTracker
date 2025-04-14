import functions from "firebase-functions"; // Use import
import admin from "firebase-admin"; // Use import
import UIDGenerator from "uid-generator"; // Use import

// Core logic extracted into a separate, testable function
async function _createTokenLogic(data, context) {
  const db = admin.firestore();
  functions.logger.log("Starting create token logic", {
    data: data,
    owner: context?.auth?.uid, // Add safe navigation for tests
  });

  // Basic validation
  if (!context?.auth?.uid) {
      functions.logger.error("Authentication context missing.");
      // Use functions.https.HttpsError for standard callable errors
      throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  if (data.note == null || !data.permissions || !(data.permissions.length > 0)) {
      functions.logger.warn("Invalid token parameters received.", { data });
      throw new functions.https.HttpsError('invalid-argument', 'Invalid token parameters: note and permissions array are required.');
  }

  const systemRef = db.collection("system").doc(context.auth.uid);
  const tokenRef = db.collection("token"); // Reference to the collection

  // Run a transaction to create the token and add it to the system document
  try {
    let generatedToken = ""; // Variable to store the token outside transaction scope
    await db.runTransaction(async (transaction) => {
      const systemDoc = await transaction.get(systemRef);

      // Check token limit
      if (systemDoc.exists && systemDoc.data()?.tokens?.length >= 5) {
        throw new functions.https.HttpsError('resource-exhausted', 'You have the maximum number of tokens (5).');
      }

      // Generate a unique token (handle potential collisions, though unlikely)
      let tokenExists = true;
      let attempts = 0;
      const uidgen = new UIDGenerator(128); // Use specific length
      let potentialToken = "";
      let potentialTokenRef;

      while (tokenExists && attempts < 5) { // Limit attempts to prevent infinite loops
          potentialToken = await uidgen.generate();
          potentialTokenRef = tokenRef.doc(potentialToken); // Use collection ref
          const existingTokenDoc = await transaction.get(potentialTokenRef);
          tokenExists = existingTokenDoc.exists;
          attempts++;
      }

      if (tokenExists) {
          // Extremely unlikely scenario
          functions.logger.error("Failed to generate a unique token after multiple attempts.", { owner: context.auth.uid });
          throw new functions.https.HttpsError('internal', 'Failed to generate a unique token.');
      }

      generatedToken = potentialToken; // Store the successfully generated token

      // Create token document
      transaction.set(potentialTokenRef, {
        owner: context.auth.uid,
        note: data.note,
        permissions: data.permissions,
        // token: generatedToken, // Storing token in doc might be redundant if doc ID is the token
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update system document
      if (systemDoc.exists) {
          transaction.update(systemRef, {
            tokens: admin.firestore.FieldValue.arrayUnion(generatedToken),
          });
      } else {
          // Create system document if it doesn't exist
          transaction.set(systemRef, {
            tokens: [generatedToken],
            // Add any other default system fields here
          });
      }
    });

    functions.logger.log("Created token successfully", {
      owner: context.auth.uid,
      token: generatedToken, // Log the actual token created
    });
    // Return only the token to the client
    return { token: generatedToken };

  } catch (e) {
    functions.logger.error("Failed to create token transaction", {
      owner: context.auth.uid,
      error: e.message || e.toString(), // Log error message
      code: e.code, // Log HttpsError code if available
      details: e.details,
    });
    // Re-throw HttpsErrors or wrap other errors
    if (e instanceof functions.https.HttpsError) {
        throw e;
    } else {
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred during token creation.', e.message);
    }
  }
}

// Export the wrapped function for Firebase deployment using ESM export
const createToken = functions.https.onCall(_createTokenLogic);
export { createToken, _createTokenLogic }; // Export both wrapped and logic function
