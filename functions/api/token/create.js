const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Create an API token for the user
// This is a Firebase callable function (not part of the REST API)
module.exports = functions.https.onCall(async (data, context) => {
  const db = admin.firestore();

  functions.logger.log("Starting create token", {
    data: data,
    owner: context.auth.uid,
  });

  if (data.note == null || !(data.permissions.length > 0)) {
    return { error: "Invalid token parameters" };
  }

  const systemRef = db.collection("system").doc(context.auth.uid);
  const systemDoc = await systemRef.get();
  // If the system document doesn't exist, create it
  if (!systemDoc.exists) {
    await systemRef.set({
      tokens: [],
    });
  }

  if (systemDoc?.data()?.tokens?.length >= 5) {
    // We have too many tokens already
    return { error: "You have the maximum number of tokens" };
  }

  // Generate a random token
  const UIDGenerator = require("uid-generator");
  const uidgen = new UIDGenerator(128);
  const token = await uidgen.generate();
  const tokenRef = db.collection("token").doc(token);
  // Run a transaction to create the token and add it to the system document
  try {
    await db.runTransaction(async (transaction) => {
      // Ensure the token doesn't already exist
      const tokenDoc = await transaction.get(tokenRef);
      if (tokenDoc.exists) {
        functions.logger.error("Token already existed", {
          owner: context.auth.uid,
          token: token,
        });
        // The user won the losing 2^128 lottery
        throw new Error("Tried to create a token that already existed");
      }
      transaction.set(tokenRef, {
        owner: context.auth.uid,
        note: data.note,
        permissions: data.permissions,
        token: token,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.update(systemRef, {
        tokens: admin.firestore.FieldValue.arrayUnion(token),
      });
    });
    functions.logger.log("Created token", {
      owner: context.auth.uid,
      token: token,
    });
    return { token: token };
  } catch (e) {
    functions.logger.error("Failed to create token", {
      owner: context.auth.uid,
      token: token,
      error: e,
    });
    return {
      error: "Error during token creation transaction",
      timestamp: Date.now(),
    };
  }
});
