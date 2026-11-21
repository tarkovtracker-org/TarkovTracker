<template>
  <div class="flex flex-wrap gap-2">
    <UButton
      v-if="canShareProfile"
      icon="i-mdi-link-variant"
      color="primary"
      size="sm"
      @click="emit('copyLink')"
    >
      {{ t('page.profile.copy_profile_link') }}
    </UButton>
    <UButton
      v-if="canCopySnapshot"
      icon="i-mdi-content-copy"
      color="neutral"
      variant="soft"
      size="sm"
      class="flex-1 sm:flex-none"
      @click="emit('copySnapshot')"
    >
      {{ t('page.profile.copy_snapshot', 'Copy Snapshot') }}
    </UButton>
    <UButton
      v-if="!isViewingSharedProfile"
      icon="i-mdi-clipboard-text-search-outline"
      color="neutral"
      variant="soft"
      size="sm"
      class="flex-1 sm:flex-none"
      @click="emit('openTasks')"
    >
      {{ t('page.profile.view_tasks', 'Open Tasks') }}
    </UButton>
  </div>
  <p v-if="canShareProfile" class="text-surface-400 text-xs break-all">{{ shareUrl }}</p>
  <p class="text-surface-400 text-[11px]">
    <template v-if="shareIsPrivate">
      {{ t('page.profile.share_private_intro', 'This mode is private. Enable sharing in ') }}
      <NuxtLink
        to="/settings#account"
        class="text-primary-300 hover:text-primary-200 light:text-primary-700 light:hover:text-primary-800 underline underline-offset-2"
      >
        {{ t('page.profile.account_settings_link', 'Account Settings') }}
      </NuxtLink>
      {{ t('page.profile.share_private_outro', ' to make this link public.') }}
    </template>
    <template v-else>
      {{ shareAccessLabel }}
    </template>
  </p>
</template>
<script setup lang="ts">
  defineProps<{
    canShareProfile: boolean;
    canCopySnapshot: boolean;
    isViewingSharedProfile: boolean;
    shareUrl: string;
    shareIsPrivate: boolean;
    shareAccessLabel: string;
  }>();
  const emit = defineEmits<{ copyLink: []; copySnapshot: []; openTasks: [] }>();
  const { t } = useI18n({ useScope: 'global' });
</script>
