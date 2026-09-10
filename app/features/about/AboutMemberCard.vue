<template>
  <li class="bg-surface-900/80 flex flex-col gap-3 rounded-lg border border-white/10 p-5">
    <div class="flex items-center gap-3.5">
      <span class="h-12 w-12 shrink-0">
        <NuxtImg
          v-if="avatarUrl && !avatarFailed"
          :src="avatarUrl"
          :alt="member.displayName"
          width="48"
          height="48"
          loading="lazy"
          class="h-12 w-12 rounded-full object-cover"
          @error="avatarFailed = true"
        />
        <span
          v-else
          aria-hidden="true"
          class="bg-primary-500/15 text-primary-300 ring-primary-400/30 flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold ring-1"
        >
          {{ initial }}
        </span>
      </span>
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-white">{{ member.displayName }}</p>
        <p class="mt-1.5">
          <span
            class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
            :class="roleBadgeClasses"
          >
            {{ t(member.roleKey) }}
          </span>
        </p>
      </div>
    </div>
    <a
      v-if="link"
      :href="link.href"
      target="_blank"
      rel="noopener noreferrer"
      class="text-info-400 hover:text-info-300 focus-visible:ring-primary-500 inline-flex min-h-11 items-center gap-1.5 self-start rounded text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <UIcon :name="link.icon" aria-hidden="true" class="h-4 w-4 shrink-0" />
      <span>{{ t(link.labelKey) }}</span>
      <span class="sr-only">({{ t('common.opens_in_new_tab') }})</span>
    </a>
  </li>
</template>
<script setup lang="ts">
  import { memberAvatarUrl, memberLink, type TeamMember } from '@/features/about/teamMembers';
  const { t } = useI18n({ useScope: 'global' });
  const props = defineProps<{
    member: TeamMember;
  }>();
  const avatarFailed = ref(false);
  const avatarUrl = computed(() => memberAvatarUrl(props.member));
  const initial = computed(() => props.member.displayName.charAt(0).toUpperCase());
  const link = computed(() => memberLink(props.member));
  const roleBadgeClasses = computed(() =>
    props.member.group === 'core'
      ? 'border-primary-400/30 bg-primary-500/10 text-primary-300'
      : 'border-white/10 bg-surface-800 text-surface-300'
  );
</script>
