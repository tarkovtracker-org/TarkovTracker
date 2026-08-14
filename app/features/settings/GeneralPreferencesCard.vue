<template>
  <GenericCard
    icon="mdi-tune-variant"
    icon-color="warning"
    highlight-color="warning"
    :fill-height="false"
    :title="$t('settings.general.title', 'General Preferences')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-3 px-4 py-4">
        <div class="flex items-center justify-between gap-3">
          <div class="space-y-1">
            <p :id="privacyModeLabelId" class="text-surface-200 text-sm font-semibold">
              {{ $t('settings.general.privacy_mode', 'Privacy Mode') }}
            </p>
            <p class="text-surface-400 text-sm">
              {{
                $t(
                  'settings.general.privacy_mode_hint',
                  "Hides sensitive information while you're streaming."
                )
              }}
            </p>
          </div>
          <USwitch
            :model-value="streamerMode"
            :aria-labelledby="privacyModeLabelId"
            :disabled="!isLoggedIn || streamerModeCooldown"
            :ui="{
              base: 'data-[state=unchecked]:bg-error-500 data-[state=checked]:bg-success-500',
            }"
            @update:model-value="handleStreamerModeToggle"
          />
        </div>
        <USeparator />
        <div class="flex items-center justify-between gap-3">
          <div class="space-y-1">
            <p :id="antifandomLabelId" class="text-surface-200 text-sm font-semibold">
              {{ $t('settings.interface.links.antifandom', 'Use antifandom.com') }}
            </p>
            <p class="text-surface-400 text-sm">
              {{
                $t(
                  'settings.interface.links.antifandom_hint',
                  'Open wiki links on antifandom.com, a community-run, ad-light mirror of Fandom, instead of fandom.com.'
                )
              }}
            </p>
          </div>
          <USwitch v-model="useAntifandom" :aria-labelledby="antifandomLabelId" />
        </div>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import type { SupabaseUser } from '@/types/supabase-plugin';
  const preferencesStore = usePreferencesStore();
  const privacyModeLabelId = 'settings-privacy-mode-label';
  const antifandomLabelId = 'settings-antifandom-label';
  const { $supabase } = useNuxtApp();
  const typedUser = computed<SupabaseUser | null>(() => {
    const supabase = $supabase as { user?: SupabaseUser } | undefined;
    return supabase?.user ?? null;
  });
  const isLoggedIn = computed(() => Boolean(typedUser.value?.loggedIn));
  const streamerModeCooldown = ref(false);
  let streamerModeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  const streamerMode = computed(() => preferencesStore.getStreamerMode);
  const handleStreamerModeToggle = (newValue: boolean) => {
    if (streamerModeCooldown.value) return;
    preferencesStore.setStreamerMode(newValue);
    streamerModeCooldown.value = true;
    streamerModeTimeoutId = setTimeout(() => {
      streamerModeCooldown.value = false;
      streamerModeTimeoutId = null;
    }, 500);
  };
  const useAntifandom = computed({
    get: () => preferencesStore.getWikiUseAntifandom,
    set: (val) => preferencesStore.setWikiUseAntifandom(val),
  });
  onUnmounted(() => {
    if (streamerModeTimeoutId) {
      clearTimeout(streamerModeTimeoutId);
      streamerModeTimeoutId = null;
    }
  });
</script>
