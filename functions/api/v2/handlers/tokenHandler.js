import functions from "firebase-functions";
import admin from "firebase-admin";

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
const getTokenInfo = async (req, res) => {
  // req.apiToken is attached by verifyBearer middleware
  if (req.apiToken?.token) {
    // We already have the token data from the middleware, just format and return
    // No need for another DB read unless we need data not stored in req.apiToken
    let tokenResponse = {
      permissions: req.apiToken.permissions ?? [],
      token: req.apiToken.token, // Use the token string from middleware
    };
    res.status(200).json(tokenResponse);
  } else {
    // This case should technically be handled by verifyBearer, but added for safety
    functions.logger.warn("getTokenInfo called without valid req.apiToken");
    res.status(401).send({ error: "Unauthorized" });
  }
};

export default {
  getTokenInfo,
};
