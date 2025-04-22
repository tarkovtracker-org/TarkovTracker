module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: ["./tsconfig.json"],
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    quotes: ["error", "double"],
    "@typescript-eslint/no-unused-vars": "warn",
    "@typescript-eslint/no-explicit-any": "warn",
    "no-console": "off",
    "require-jsdoc": "off",
    "valid-jsdoc": "off",
    "new-cap": "off",
    "max-len": ["warn", { code: 120 }],
  },
  ignorePatterns: [
    "lib/**/*",
    "node_modules/**/*",
    ".eslintrc.js",
    "vitest.config.js",
  ],
};
