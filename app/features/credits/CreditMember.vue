<template>
  <li class="min-w-0">
    <component :is="linkTag" v-bind="linkAttributes" :title="tooltip" :class="itemClasses">
      <NuxtImg
        v-if="member.avatar"
        :src="member.avatar"
        alt=""
        :class="avatarClasses"
        :width="avatarSize"
        :height="avatarSize"
        loading="lazy"
      />
      <span class="truncate" :class="{ 'min-w-0 flex-1': showsCount }">{{ member.name }}</span>
      <CreditContributionCount :count="member.contributions" />
      <span v-if="member.link" class="sr-only">({{ t('common.opens_in_new_tab') }})</span>
      <UIcon
        v-if="showExternalIcon"
        name="i-mdi-open-in-new"
        aria-hidden="true"
        class="text-surface-400 ml-auto h-4 w-4 shrink-0"
      />
    </component>
  </li>
</template>
<script setup lang="ts">
  import CreditContributionCount from '@/features/credits/CreditContributionCount.vue';
  import {
    creditMemberAvatarClasses,
    creditMemberAvatarSize,
    creditMemberClasses,
  } from '@/features/credits/creditMemberStyles';
  import type { CreditMember, CreditMemberVariant } from '@/features/credits/types';
  const { t } = useI18n({ useScope: 'global' });
  const props = defineProps<{
    member: CreditMember;
    variant: CreditMemberVariant;
  }>();
  const isRow = computed(() => props.variant === 'row');
  const showsCount = computed(() => props.member.contributions != null);
  const showExternalIcon = computed(() => isRow.value && Boolean(props.member.link));
  const linkTag = computed(() => (props.member.link ? 'a' : 'div'));
  const tooltip = computed(() => (isRow.value ? undefined : props.member.name));
  const linkAttributes = computed(() =>
    props.member.link
      ? { href: props.member.link, target: '_blank', rel: 'noopener noreferrer' }
      : {}
  );
  const avatarSize = computed(() => creditMemberAvatarSize(props.variant));
  const avatarClasses = computed(() => creditMemberAvatarClasses(props.variant));
  const itemClasses = computed(() =>
    creditMemberClasses(props.variant, Boolean(props.member.link))
  );
</script>
