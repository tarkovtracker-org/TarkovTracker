import {
  ApolloClient,
  createHttpLink,
  InMemoryCache,
  type NormalizedCacheObject, // Import type for explicit client typing
} from '@apollo/client/core';
import type { HttpOptions } from '@apollo/client/core'; // Import type for fetchOptions
// HTTP connection to the API
const httpLink = createHttpLink({
  // You should use an absolute URL here
  uri: 'https://api.tarkov.dev/graphql',
  fetchOptions: {
    // Consider adding explicit type if needed, though often inferred
    timeout: 10000,
  } as HttpOptions['fetchOptions'], // Cast to satisfy potential type needs
});
// Cache implementation
// Explicit type not strictly necessary due to inference but can be added
const cache = new InMemoryCache();
// Create the apollo client
// Explicitly type the client for clarity
const apolloClient: ApolloClient<NormalizedCacheObject> = new ApolloClient({
  link: httpLink,
  cache,
});
export default apolloClient;
