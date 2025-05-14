import functions from "firebase-functions";
import express, { Express, Request, Response, NextFunction } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { verifyBearer } from "./middleware/auth.js";
import tokenHandler from "./handlers/tokenHandler.js";
import progressHandler from "./handlers/progressHandler.js";

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

// Apply token verification middleware to all subsequent routes
app.use(
  verifyBearer as (req: Request, res: Response, next: NextFunction) => void,
);

type AuthenticatedHandler = (
  req: AuthenticatedRequest,
  res: Response,
  next?: NextFunction,
) => void | Promise<void>;

// Token Routes
/**
 * @openapi
 * /token:
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
 * /progress:
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
 * /team/progress:
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
 * /progress/level/{levelValue}:
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
 * /progress/task/{taskId}:
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
 * /progress/tasks:
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
 * /progress/task/objective/{objectiveId}:
 *   post:
 *     summary: Update task objective
 *     description: Update the progress objectives of tasks.
 *     tags:
 *       - Progress
 *     parameters:
 *       - in: path
 *         name: objectiveId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the objective to update progress for.
 *     requestBody:
 *       required: true
 *       description: Objective properties to update.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               state:
 *                 type: string
 *                 description: The new state of the objective (e.g., "completed").
 *                 example: "completed"
 *               count:
 *                 type: integer
 *                 description: The new count for the objective.
 *                 example: 0
 *             required: # Optional: specify if these fields are strictly required by the backend
 *               - state
 *               - count
 *           example:
 *             state: "completed"
 *             count: 0
 *     responses:
 *       '200': # Note: response codes should often be quoted if they are numbers
 *         description: The objective was updated successfully.
 *       '400':
 *         description: Invalid request parameters.
 *       '401':
 *         description: Unauthorized to update progress.
 *       '500':
 *         description: Internal server error.
 */
app.post(
  "/api/v2/progress/task/objective/:objectiveId",
  progressHandler.updateTaskObjective as AuthenticatedHandler,
);

// Error handler - logs error and sends 500
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
export { apiFunction as apiv2Default, app as rawApp }; // Export both wrapped function and raw app
