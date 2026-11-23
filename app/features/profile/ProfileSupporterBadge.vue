<template>
  <UBadge
    v-if="badge"
    :color="current ? 'success' : 'warning'"
    icon="i-lucide-heart-handshake"
    size="sm"
    variant="soft"
  >
    {{ label }}
  </UBadge>
</template>
<script setup lang="ts">
  import type { ProfileSupporterBadge } from '@/utils/profileSupporterBadge';
  const { badge } = defineProps<{ badge: ProfileSupporterBadge | null }>();
  const { t } = useI18n({ useScope: 'global' });
  const current = computed(() => badge === 'active_subscriber');
  const label = computed(() =>
    current.value ? t('page.profile.badge_active_subscriber') : t('page.profile.badge_supporter')
  );
</script>
