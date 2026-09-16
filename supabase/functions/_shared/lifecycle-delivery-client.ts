import { lifecycleDatabaseFetch } from './lifecycle-delivery-context.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
/** Authentication occurs before admission. This header binds service RPCs to that admission. */
export function lifecycleDeliveryClient(invocation: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: lifecycleDatabaseFetch, headers: { 'x-lifecycle-delivery': invocation } },
    }
  );
}
