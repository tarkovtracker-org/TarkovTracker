import functions from 'firebase-functions';
import { Request, Response } from 'express';
import admin from 'firebase-admin'; // Although not directly used, keep for consistency or potential future use

// Define minimal interface for the token data attached by middleware
// Duplicated from auth.ts/index.ts for simplicity, consider shared types
interface ApiTokenData {
  owner: string;
  note: string;
  permissions: string[];
  calls?: number;
  createdAt?: admin.firestore.Timestamp;
}
interface ApiToken extends ApiTokenData {
  token: string;
}
// Extend the Express Request interface
interface AuthenticatedRequest extends Request {
  apiToken?: ApiToken;
}
// Define the expected response structure
interface TokenInfoResponse {
  permissions: string[];
  token: string;
}

/**
 * @openapi
 * /token:
 *   get:
 *     summary: "Returns data associated with the Token given in the Authorization header of the request"
 *     tags:
 *       - "Token"
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Token details retrieved successfully."
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 permissions:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: "Permissions associated with the token."
 *                 token:
 *                   type: string
 *                   description: "The API token string."
 *       401:
 *         description: "Unauthorized. Invalid or missing token."
 *       500:
 *         description: "Internal server error."
 */
const getTokenInfo = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  // req.apiToken is attached by verifyBearer middleware
  if (req.apiToken?.token) {
    // We already have the token data from the middleware, just format and return
    const tokenResponse: TokenInfoResponse = {
      permissions: req.apiToken.permissions ?? [],
      token: req.apiToken.token, // Use the token string from middleware
    };
    res.status(200).json(tokenResponse);
  } else {
    // This case should technically be handled by verifyBearer, but added for safety
    functions.logger.warn('getTokenInfo called without valid req.apiToken');
    res.status(401).send({ error: 'Unauthorized' });
  }
};
export default { getTokenInfo };
