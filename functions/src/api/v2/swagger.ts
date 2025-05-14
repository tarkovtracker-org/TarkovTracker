import swaggerJsdoc from "swagger-jsdoc";
import fs from "fs";
import path, { dirname } from "path"; // Use path for better file path handling
import { fileURLToPath } from "url";

// ES Module equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define the options for swagger-jsdoc
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "TarkovTracker API (Fork)",
      description:
        "Unofficial TarkovTracker API a fork of the original TarkovTracker API - player's progress, objectives, level, reputation and much more in one place. If you are missing something here, let the developers know on the DysektAI/TarkovTracker Discord server or create a new issue on GitHub.",
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
  apis: ["lib/api/v2/index.js", "lib/api/v2/components.js"],
};
// Generate the OpenAPI specification
const openapiSpecification = swaggerJsdoc(swaggerOptions);
// Define the output path relative to the current file
// Go up four levels from src/api/v2 to the root project dir, then into docs
const outputPath = path.join(__dirname, "../../../../docs/openapi.json");
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
      const jsOutputPath = path.join(__dirname, "../../../../docs/openapi.js");
      const jsContent = `window.openapi = ${JSON.stringify(openapiSpecification, null, 2)};`;
      fs.writeFile(jsOutputPath, jsContent, (err) => {
        if (err) {
          console.error("Error writing OpenAPI JS file:", err);
          process.exit(1);
        } else {
          console.log(
            `OpenAPI JS file created successfully at ${jsOutputPath}`,
          );
        }
      });
    }
  },
);
