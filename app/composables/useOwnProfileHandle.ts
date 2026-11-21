import { isProfileHandle } from '@/utils/profileHandle';
import type { SupabaseClient } from '@supabase/supabase-js';
const saveErrors: Partial<Record<string, 'taken' | 'invalid' | 'cooldown'>> = {
  '23505': 'taken',
  '23514': 'invalid',
  PT429: 'cooldown',
};
const writeProfileHandle = (
  client: SupabaseClient,
  id: string,
  previous: string | null,
  value: string
) => {
  const handles = client.from('profile_handles');
  return previous
    ? handles
        .update({ handle: value })
        .eq('user_id', id)
        .eq('handle', previous)
        .select('handle')
        .maybeSingle()
    : handles.insert({ handle: value, user_id: id });
};
export const useOwnProfileHandle = (enabled: Ref<boolean> = ref(true)) => {
  const { $supabase } = useNuxtApp();
  const userId = computed(() =>
    enabled.value && $supabase.user.loggedIn ? $supabase.user.id : null
  );
  const record = ref<{ userId: string; handle: string | null }>();
  const loading = ref(false);
  const failed = ref(false);
  const loadVersion = ref(0);
  const handle = computed(() =>
    record.value?.userId === userId.value ? (record.value?.handle ?? null) : null
  );
  watch(
    [userId, loadVersion],
    async ([id], _previous, onCleanup) => {
      let current = true;
      onCleanup(() => {
        current = false;
      });
      record.value = undefined;
      failed.value = false;
      loading.value = Boolean(id);
      if (!id) return;
      try {
        const { data, error } = await $supabase.client
          .from('profile_handles')
          .select('handle')
          .eq('user_id', id)
          .maybeSingle();
        if (!current) return;
        if (error) throw error;
        record.value = { userId: id, handle: isProfileHandle(data?.handle) ? data.handle : null };
      } catch {
        if (current) failed.value = true;
      } finally {
        if (current) loading.value = false;
      }
    },
    { immediate: true }
  );
  const save = async (value: string) => {
    const id = userId.value;
    if (!id || !isProfileHandle(value)) return 'invalid';
    const previous = handle.value;
    const { data, error } = await writeProfileHandle($supabase.client, id, previous, value);
    if (userId.value !== id) return 'invalid';
    if (error) return saveErrors[error.code] ?? 'failed';
    if (previous && !data) {
      loadVersion.value += 1;
      return 'failed';
    }
    record.value = { userId: id, handle: value };
    return 'saved';
  };
  const retry = () => {
    loadVersion.value += 1;
  };
  return { handle, loading, failed, save, retry };
};
