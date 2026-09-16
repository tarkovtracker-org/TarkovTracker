import type { Database } from './database.types.ts';
// These assignments are compile-time assertions against the actual generated schema.
const leave: Database['public']['Functions']['leave_team'] = {
  Args: { p_team_id: 'team', p_user_id: 'user' },
  Returns: 'left',
};
const graphql: keyof Database['graphql_public']['Functions'] = 'graphql';
const noGraphqlLeave: 'leave_team' extends keyof Database['graphql_public']['Functions']
  ? false
  : true = true;
Deno.test('leave RPC belongs to public and GraphQL remains separate', () => {
  if (leave.Returns !== 'left' || graphql !== 'graphql' || !noGraphqlLeave) {
    throw new Error('Incorrect database function schema');
  }
});
