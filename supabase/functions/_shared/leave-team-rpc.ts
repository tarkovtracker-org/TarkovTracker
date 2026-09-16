import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';
const retryableCodes = new Set(['40P01', '40001', '55P03']);
export const isRetryableLeaveError = (code: string) => retryableCodes.has(code);
const shouldRetry = (code: string, attempt: number) => attempt < 2 && isRetryableLeaveError(code);
export const invokeLeaveTeam = async (
  supabase: SupabaseClient<Database>,
  args: Database['public']['Functions']['leave_team']['Args'],
  attempt = 0
): Promise<{ data: string | null; error: { code: string } | null }> => {
  const result = await supabase.rpc('leave_team', args);
  if (shouldRetry(result.error?.code ?? '', attempt)) {
    // Retry the entire aborted transaction only; never retry an ambiguous transport failure.
    await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    return invokeLeaveTeam(supabase, args, attempt + 1);
  }
  return result;
};
