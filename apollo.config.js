module.exports = {
  client: {
    service: {
      name: 'tarkov-dev-api',
      url: 'https://api.tarkov.dev/graphql',
    },
    includes: [
      'frontend/src/**/*.vue',
      'frontend/src/**/*.js',
      'frontend/src/**/*.ts',
      'frontend/src/**/*.gql',
      'frontend/src/**/*.graphql',
    ],
  }
};
