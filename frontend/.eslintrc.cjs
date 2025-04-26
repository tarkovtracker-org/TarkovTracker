module.exports = {
  // Prevent ESLint from searching for config files in parent directories
  root: true,
  env: {
    // Specify environments, browser for web projects, es2022 for modern ES features
    browser: true,
    es2022: true,
    // Keep node: true if you have Node.js specific code (e.g., build scripts) accessed by linted files
    node: true,
  },
  // Use vue-eslint-parser to parse .vue files
  parser: "vue-eslint-parser",
  parserOptions: {
    // Specify the parser for <script> blocks (TypeScript)
    parser: "@typescript-eslint/parser",
    // Use the latest ECMAScript version
    ecmaVersion: "latest",
    // Use ES modules
    sourceType: "module",
    // Optional: Enable type-aware linting (requires tsconfig.json setup)
    // project: "./tsconfig.json",
    // extraFileExtensions: [".vue"], // Needed if using project
  },
  // Add the TypeScript plugin
  plugins: ["@typescript-eslint"],
  extends: [
    // Base ESLint recommended rules
    "eslint:recommended",
    // TypeScript specific recommended rules
    "plugin:@typescript-eslint/recommended",
    // Vue 3 specific recommended rules
    "plugin:vue/vue3-recommended",
    // Prettier integration (must be last to override other configs)
    "prettier",
  ],
  rules: {
    // Your existing overrides:
    "no-debugger": "off",

    // Disable base no-unused-vars, enable TypeScript version
    "no-unused-vars": "off",
    // Consider enabling this if you want to catch unused variables/types:
    // "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],

    // Add any project-specific rule overrides here
    // e.g., 'vue/multi-word-component-names': 'off'
  },
  // Add overrides for specific file types or directories
  overrides: [
    {
      // Target JavaScript files specifically in the root directory (e.g., config files)
      files: ["./*.js"],
      parserOptions: {
        // Tell ESLint these files use CommonJS modules
        sourceType: "script",
      },
      env: {
        node: true,
      },
      // Optionally, disable rules here that conflict with CommonJS if needed
      // rules: {
      //   '@typescript-eslint/no-var-requires': 'off',
      // }
    },
  ],
};
