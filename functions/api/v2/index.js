import functions from "firebase-functions";
import express from "express"; // Changed from require
import bodyParser from "body-parser"; // Changed from require
import cors from "cors"; // Changed from require

// Import Middleware using ESM
import { verifyBearer } from "./middleware/auth.js"; // Assuming auth.js uses ESM or is compatible

// Import Handlers using ESM
import tokenHandler from "./handlers/tokenHandler.js"; // Assuming default export or adjust as needed
import progressHandler from "./handlers/progressHandler.js"; // Assuming default export or adjust as needed

// Initialize Express App and apply middleware
const app = express();
app.use((req, res, next) => {
  console.log(`Incoming request to ${req.method} ${req.url}`);
  next();
});
app.use(cors({ origin: true })); // Allow all origins
app.use(bodyParser.json()); // Use JSON body parser
app.use(bodyParser.urlencoded({ extended: true }));

// --- Public Routes (if any, none currently) ---
// Example: app.get("/api/v2/status", (req, res) => res.status(200).send("OK"));

// --- Protected Routes ---
// Apply token verification middleware to all subsequent routes
app.use(verifyBearer);

// Token Routes
app.get("/api/v2/token", tokenHandler.getTokenInfo);

// Progress Routes
app.get("/api/v2/progress", progressHandler.getPlayerProgress);
app.get("/api/v2/team/progress", progressHandler.getTeamProgress);
app.post(
  "/api/v2/progress/level/:levelValue", // Removed inline regex, validate in handler
  progressHandler.setPlayerLevel,
);
app.post("/api/v2/progress/task/:taskId", progressHandler.updateSingleTask);
app.post("/api/v2/progress/tasks", progressHandler.updateMultipleTasks);
app.post(
  "/api/v2/progress/task/objective/:objectiveId",
  progressHandler.updateTaskObjective,
);

// Commented out Hideout routes (matching original file)
// app.post('/api/v2/progress/hideout/:hideoutId(\\d+)', progressHandler.updateHideoutModule);
// app.post('/api/v2/progress/hideout/objective/:objectiveId(\\d+)', progressHandler.updateHideoutObjective);

// --- Error Handler ---
// Basic error handler - logs error and sends 500
// Place this after all route definitions
app.use((err, req, res, next) => {
  const errorDetails = {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    user: {
      id: req.user?.id,
      username: req.user?.username,
      roles: req.user?.roles,
    },
    token: {
      owner: req.apiToken?.owner,
      scope: req.apiToken?.scope,
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
const apiFunction = functions.https.onRequest(app); // Changed from exports.default

export { apiFunction as default, app as rawApp }; // Export both wrapped function and raw app
