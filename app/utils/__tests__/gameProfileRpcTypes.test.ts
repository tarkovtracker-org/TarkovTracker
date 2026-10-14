// @vitest-environment node
import { expectTypeOf, it } from 'vitest';
import type { Database, Json } from '~~/supabase/functions/_shared/database.types';
type ProfileFunctions = Database['public']['Functions'];
it('accepts the nullable game profile RPC inputs supported by SQL', () => {
  expectTypeOf<ProfileFunctions['update_game_profile']['Args']>().toEqualTypeOf<{
    p_eft_account_id: string | null;
    p_label: string | null;
    p_profile_id: string | null;
  }>();
  expectTypeOf<ProfileFunctions['add_game_profile']['Args']>().toEqualTypeOf<{
    p_eft_account_id: string | null;
    p_label: string | null;
  }>();
  expectTypeOf<ProfileFunctions['sync_game_profile_progress']['Args']>().toEqualTypeOf<{
    p_game_edition: number | null;
    p_modes: Json;
    p_profile_id: string;
    p_seasonal_season_number?: number | null;
  }>();
});
