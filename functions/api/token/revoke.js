const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Remove an API token for the user
// This is a Firebase callable function (not part of the REST API)
module.exports = functions.https.onCall(async (data, context) => {
  const db = admin.firestore();

  if (data.token == null) {
    functions.logger.error("No token specified", { owner: context.auth.uid });
    return { error: "Invalid token parameters", timestamp: Date.now() };
  }

  const systemRef = db.collection("system").doc(context.auth.uid);
  const tokenRef = db.collection("token").doc(data.token);

  // Run a transaction to remove the token from the system document and delete the token document
  try {
    await db.runTransaction(async (transaction) => {
      // Ensure the token doesn't already exist
      const tokenDoc = await transaction.get(tokenRef);
      const systemDoc = await transaction.get(systemRef);
      // If tokenDoc or systemDoc doesn't exist, there's something wrong
      if (!tokenDoc.exists || !systemDoc.exists) {
        functions.logger.error("Token or system document doesn't exist", {
          owner: context.auth.uid,
          token: data.token,
          tokenDoc: tokenDoc.exists,
          systemDoc: systemDoc.exists,
        });
        throw new Error("Token or system document doesn't exist");
      }
      // If the token doesn't belong to the user, there's something wrong
      if (tokenDoc.data().owner != context.auth.uid) {
        throw new Error("Token doesn't belong to user");
      }

      // Assuming everything is fine, remove the token from the system document and delete the token document
      transaction.update(systemRef, {
        tokens: admin.firestore.FieldValue.arrayRemove(data.token),
      });
      transaction.delete(tokenRef);
    });
    functions.logger.log("Removed token", {
      owner: context.auth.uid,
      token: data.token,
    });
    return { revoked: true };
  } catch (e) {
    functions.logger.error("Failed to create token", {
      owner: context.auth.uid,
      token: data.token,
      error: e,
    });
    return { error: "Error during token deletion", timestamp: Date.now() };
  }
});
