import { isProfileHandle } from '@/utils/profileHandle';
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
    record.value?.userId === userId.value ? record.value?.handle : null
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
    if (value === previous) return 'saved';
    const handles = $supabase.client.from('profile_handles');
    const { data, error } = previous
      ? await handles
          .update({ handle: value })
          .eq('user_id', id)
          .eq('handle', previous)
          .select('handle')
          .maybeSingle()
      : await handles.insert({ handle: value, user_id: id });
    if (userId.value !== id) return 'invalid';
    if (error?.code === '23505') return 'taken';
    if (error?.code === '23514') return 'invalid';
    if (error?.code === 'PT429') return 'cooldown';
    if (previous && !error && !data) loadVersion.value += 1;
    if (error || (previous && data?.handle !== value)) return 'failed';
    record.value = { userId: id, handle: value };
    return 'saved';
  };
  const retry = () => {
    loadVersion.value += 1;
  };
  return { handle, loading, failed, save, retry };
};
