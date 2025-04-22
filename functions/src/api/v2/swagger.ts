import swaggerJsdoc from "swagger-jsdoc";
import fs from "fs";
import path from "path"; // Use path for better file path handling

// Define the options for swagger-jsdoc
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "TarkovTracker API",
      description:
        "Official TarkovTracker API - player's progress, objectives, level, reputation and much more in one place. If you are missing something here, let the developers know on TarkovTracker Discord server or create a new issue on GitHub.",
      version: "2.0", // Consider dynamically getting version from package.json
      contact: {
        name: "TarkovTracker GitHub",
        url: "https://github.com/DysektAI/TarkovTracker",
      },
      license: {
        name: "GNU General Public License v3.0",
        url: "https://www.gnu.org/licenses/gpl-3.0.en.html",
      },
    },
    servers: [
      {
        // Use environment variable or configuration for base URL
        url: process.env.API_BASE_URL || "https://tarkovtracker.org/api/v2",
        description: "TarkovTracker API v2 endpoint",
      },
    ],
    tags: [
      {
        name: "Token",
        description: "Operations related to API tokens",
      },
      {
        name: "Progress",
        description: "Operations related to player and team progress",
      },
    ],
    // Define security scheme (Bearer Auth)
    components: {
      securitySchemes: {
        bearerAuth: {
          // Matches the name used in security property of operations
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT", // Optional, can describe the token format
        },
      },
      // Component definitions will be loaded from components.ts via 'apis' below
    },
    security: [
      {
        bearerAuth: [], // Apply bearerAuth globally by default
      },
    ],
  },
  // Path to the API docs files (TypeScript handlers and component definitions)
  apis: [
    path.join(__dirname, "./handlers/*.ts"), // Path to handler files
    path.join(__dirname, "./components.ts"), // Path to components file
  ],
};
// Generate the OpenAPI specification
const openapiSpecification = swaggerJsdoc(swaggerOptions);
// Define the output path relative to the current file
const outputPath = path.join(__dirname, "../../../docs/openapi.json"); // Output JSON is generally more standard
const outputDir = path.dirname(outputPath);
// Ensure the output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
// Write the specification to a JSON file
fs.writeFile(
  outputPath,
  JSON.stringify(openapiSpecification, null, 2), // Pretty print JSON
  (err) => {
    if (err) {
      console.error("Error writing OpenAPI specification:", err);
      process.exit(1); // Exit with error code
    } else {
      console.log(
        `OpenAPI specification created successfully at ${outputPath}`,
      );
    }
  },
);
