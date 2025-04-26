module.exports = {
  client: {
    service: {
      name: "tarkov-tracker",
      // URL to the GraphQL API
      url: "http://localhost:5001/tarkovtracker-dev/us-central1/graphql",
    },
    // Files processed by the extension
    includes: [
      "frontend/src/**/*.vue",
      "frontend/src/**/*.js",
      "frontend/src/**/*.ts",
    ],
  },
};
