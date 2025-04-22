import functions from "firebase-functions";
import admin from "firebase-admin";
import { Request, Response, NextFunction } from "express";
import {
  Firestore,
  DocumentReference,
  DocumentSnapshot,
} from "firebase-admin/firestore";

// Define minimal interface for the token document data expected
// Duplicated from index.ts for simplicity, consider shared types for larger projects
interface ApiTokenData {
  owner: string;
  note: string;
  permissions: string[];
  calls?: number; // Optional calls field
  createdAt?: admin.firestore.Timestamp;
}

// Define interface for the apiToken added to the request
interface ApiToken extends ApiTokenData {
  token: string; // Add the actual token string
}

// Extend the Express Request interface to include apiToken
interface AuthenticatedRequest extends Request {
  apiToken?: ApiToken;
}

/**
 * @function verifyBearer
 * @description Middleware that checks if the Authorization header is valid
 *              and if the token is authorized to access the requested resource
 * @param {AuthenticatedRequest} req - The Express request object, extended with apiToken
 * @param {Response} res - The Express response object
 * @param {NextFunction} next - The Express next function
 */
const verifyBearer = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const db: Firestore = admin.firestore();
  const authHeader = req.get("Authorization");
  // If no auth, 401
  if (authHeader == null) {
    res.status(401).json({ error: "No Authorization header sent" }).send();
    return; // Stop execution after sending response
  }
  try {
    const parts = authHeader.split(" ");
    // If auth broken, 400
    if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
      res
        .status(400)
        .json({
          error:
            "Invalid Authorization header format. Expected 'Bearer <token>'.",
        })
        .send();
      return; // Stop execution after sending response
    }
    const authToken: string = parts[1];
    // Check if token is valid
    const tokenRef: DocumentReference<ApiTokenData> = db
      .collection("token")
      .doc(authToken) as DocumentReference<ApiTokenData>;
    const tokenDoc: DocumentSnapshot<ApiTokenData> = await tokenRef.get();
    if (tokenDoc.exists) {
      const tokenData = tokenDoc.data();
      if (!tokenData) {
        // Should not happen if tokenDoc.exists is true, but satisfy TypeScript
        functions.logger.error("Token document exists but data is undefined", {
          token: authToken,
        });
        res
          .status(500)
          .send({ error: "Internal server error reading token data." });
        return;
      }
      functions.logger.log("Found Token", { token: tokenData });
      // Attach token data (including the token string itself) to the request
      req.apiToken = { ...tokenData, token: authToken };
      // Update calls asynchronously, don't wait for it
      const callIncrement = admin.firestore.FieldValue.increment(1);
      tokenRef.update({ calls: callIncrement }).catch((err: any) => {
        functions.logger.error("Failed to increment token calls", {
          error: err,
          token: authToken,
        });
      });
      next(); // Proceed to the next middleware/handler
    } else {
      functions.logger.log("Did not find token", { token: authToken });
      res.status(401).send({ error: "Invalid or expired token." }); // Send specific error
    }
  } catch (error: any) {
    functions.logger.error(
      "Error during token verification:",
      { authHeader: authHeader, error: error.message || error }, // Log error message
    );
    res
      .status(500)
      .json({ error: "Internal server error during authentication." })
      .send();
  }
};

export { verifyBearer };
