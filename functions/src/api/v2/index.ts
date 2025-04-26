/**
 * @openapi
 * /test:
 *   get:
 *     summary: Test endpoint
 *     responses:
 *       200:
 *         description: OK
 */
import functions from "firebase-functions";
import express, { Express, Request, Response, NextFunction } from "express";
import bodyParser from "body-parser";
import cors from "cors";

// TODO: Convert middleware/auth.js to TypeScript and remove .js extension
import { verifyBearer } from "./middleware/auth.js";

// TODO: Convert handlers to TypeScript and remove .js extensions
// Define interfaces for handler structures if possible
import tokenHandler from "./handlers/tokenHandler.js";
import progressHandler from "./handlers/progressHandler.js";

// Define interfaces for custom request properties added by middleware
interface ApiToken {
  owner: string;
  scope: string[];
  // Add other token properties if they exist
}

interface UserContext {
  id: string;
  username?: string; // Optional property
  roles?: string[]; // Optional property
  // Add other user properties if they exist
}

// Extend the Express Request interface
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface AuthenticatedRequest extends Request {
  apiToken?: ApiToken; // Add optional apiToken property
  user?: UserContext; // Add optional user property
}

// Initialize Express App and apply middleware
const app: Express = express();

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`Incoming request to ${req.method} ${req.url}`);
  next();
});

app.use(cors({ origin: true })); // Allow all origins
app.use(bodyParser.json()); // Use JSON body parser
app.use(bodyParser.urlencoded({ extended: true }));

// --- Public Routes (if any, none currently) ---
// Example: app.get("/api/v2/status", (req: Request, res: Response) => res.status(200).send("OK"));

// --- Protected Routes ---
// Apply token verification middleware to all subsequent routes
// Assuming verifyBearer middleware adds `apiToken` and potentially `user` to the request
app.use(
  verifyBearer as (req: Request, res: Response, next: NextFunction) => void,
);

// Define handlers with typed requests (assuming handlers expect AuthenticatedRequest)
type AuthenticatedHandler = (
  req: AuthenticatedRequest,
  res: Response,
  next?: NextFunction,
) => void | Promise<void>;

// Token Routes
/**
 * @openapi
 * /api/v2/token:
 *   get:
 *     summary: Returns data associated with the Token given in the Authorization header of the request
 *     tags:
 *       - Token
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 permissions:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Permissions associated with the token.
 *                 token:
 *                   type: string
 *                   description: The API token string.
 *       401:
 *         description: Unauthorized. Invalid or missing token.
 *       500:
 *         description: Internal server error.
 */
app.get("/api/v2/token", tokenHandler.getTokenInfo as AuthenticatedHandler);

// Progress Routes
/**
 * @openapi
 * /api/v2/progress:
 *   get:
 *     summary: Returns progress data of the player
 *     tags:
 *       - Progress
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Player progress retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: "#/components/schemas/Progress"
 *                 meta:
 *                   type: object
 *                   properties:
 *                     self:
 *                       type: string
 *                       description: The user ID of the requester.
 *       401:
 *         description: Unauthorized. Invalid token or missing 'GP' permission.
 *       500:
 *         description: Internal server error.
 */
app.get(
  "/api/v2/progress",
  progressHandler.getPlayerProgress as AuthenticatedHandler,
);
/**
 * @openapi
 * /api/v2/team/progress:
 *   get:
 *     summary: Returns progress data of all members of the team
 *     tags:
 *       - Progress
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Team progress retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TeamProgress'
 *       401:
 *         description: Unauthorized. Invalid token or missing 'TP' permission.
 *       500:
 *         description: Internal server error.
 */
app.get(
  "/api/v2/team/progress",
  progressHandler.getTeamProgress as AuthenticatedHandler,
);
/**
 * @openapi
 * /api/v2/progress/level/{levelValue}:
 *   post:
 *     summary: Set player level
 *     tags:
 *       - Progress
 *     parameters:
 *       - in: path
 *         name: levelValue
 *         required: true
 *         schema:
 *           type: integer
 *         description: The new level value
 *     responses:
 *       200:
 *         description: Player level set
 */
app.post(
  "/api/v2/progress/level/:levelValue",
  progressHandler.setPlayerLevel as AuthenticatedHandler,
);
/**
 * @openapi
 * /api/v2/progress/task/{taskId}:
 *   post:
 *     summary: Update a single task
 *     tags:
 *       - Progress
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Task updated
 */
app.post(
  "/api/v2/progress/task/:taskId",
  progressHandler.updateSingleTask as AuthenticatedHandler,
);
/**
 * @openapi
 * /api/v2/progress/tasks:
 *   post:
 *     summary: Update multiple tasks
 *     tags:
 *       - Progress
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *     responses:
 *       200:
 *         description: Tasks updated
 */
app.post(
  "/api/v2/progress/tasks",
  progressHandler.updateMultipleTasks as AuthenticatedHandler,
);
/**
 * @openapi
 * /api/v2/progress/task/objective/{objectiveId}:
 *   post:
 *     summary: Update task objective
 *     tags:
 *       - Progress
 *     parameters:
 *       - in: path
 *         name: objectiveId
 *         required: true
 *         schema:
 *           type: string
 *         description: Objective ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Task objective updated
 */
app.post(
  "/api/v2/progress/task/objective/:objectiveId",
  progressHandler.updateTaskObjective as AuthenticatedHandler,
);

// Commented out Hideout routes (matching original file)
// app.post('/api/v2/progress/hideout/:hideoutId', progressHandler.updateHideoutModule as AuthenticatedHandler);
// app.post('/api/v2/progress/hideout/objective/:objectiveId', progressHandler.updateHideoutObjective as AuthenticatedHandler);

// --- Error Handler ---
// Basic error handler - logs error and sends 500
// Place this after all route definitions
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  // Use AuthenticatedRequest to access custom properties safely
  const authReq = req as AuthenticatedRequest;
  const errorDetails = {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    user: {
      id: authReq.user?.id,
      username: authReq.user?.username,
      roles: authReq.user?.roles,
    },
    token: {
      owner: authReq.apiToken?.owner,
      scope: authReq.apiToken?.scope,
    },
    headers: req.headers,
  };
  functions.logger.error("Unhandled error in API v2:", errorDetails);
  // Conditionally log more details in development environment
  if (process.env.NODE_ENV === "development") {
    console.error("Error details:", errorDetails);
  }
  // Avoid sending detailed errors to the client in production
  res.status(500).send({
    error: "An internal server error occurred.",
    isDevelopment: process.env.NODE_ENV === "development",
  });
});

// Export the express app as a single Cloud Function using ESM export
const apiFunction = functions.https.onRequest(app);
export { apiFunction as default, app as rawApp }; // Export both wrapped function and raw app
