import functions from "firebase-functions";
import admin from "firebase-admin";

/**
 * @function verifyBearer
 * @description Middleware that checks if the Authorization header is valid
 *              and if the token is authorized to access the requested resource
 * @param {express.Request} req - The Express request object
 * @param {express.Response} res - The Express response object
 * @param {express.NextFunction} next - The Express next function
 * @throws {Error} If the Authorization header is not set or is invalid
 * @throws {Error} If the token is not authorized to access the requested resource
 */
const verifyBearer = async (req, res, next) => {
  const db = admin.firestore();
  const authHeader = req.get("Authorization");
  // If no auth, 401
  if (authHeader == null) {
    res.status(401).json({ error: "No Authorization header sent" }).send();
    return; // Stop execution after sending response
  }
  try {
    // If auth broken, 400
    if (authHeader.split(" ")[1] == null) {
      res.status(400).json({ error: "No bearer token set" }).send();
      return; // Stop execution after sending response
    }
    let authToken = authHeader.split(" ")[1];
    // Check if token is valid
    const tokenRef = db.collection("token").doc(authToken);
    const tokenDoc = await tokenRef.get();
    if (tokenDoc.exists) {
      functions.logger.log("Found Token", { token: tokenDoc.data() });
      const callIncrement = admin.firestore.FieldValue.increment(1);
      // Update calls asynchronously, don't wait for it
      tokenRef.update({ calls: callIncrement }).catch((err) => {
        functions.logger.error("Failed to increment token calls", {
          error: err,
          token: authToken,
        });
      });
      req.apiToken = tokenDoc.data();
      req.apiToken.token = authToken; // Ensure the actual token string is attached
      next();
    } else {
      functions.logger.log("Did not find token", { token: authToken });
      res.status(401).send();
    }
  } catch (error) {
    functions.logger.error(
      "Unknown error with Authorization header:",
      authHeader,
      error, // Log the actual error
    );
    res
      .status(400)
      .json({ error: "Unknown error with Authorization header" })
      .send();
  }
};

export { verifyBearer };
