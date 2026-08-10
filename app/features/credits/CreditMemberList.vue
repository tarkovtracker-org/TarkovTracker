<template>
  <component :is="listTag" role="list" :class="listClasses">
    <CreditMember
      v-for="(member, index) in members"
      :key="member.name"
      :member="member"
      :rank="ordered ? index + 1 : undefined"
      :variant="variant"
    />
  </component>
</template>
<script setup lang="ts">
  import CreditMember from '@/features/credits/CreditMember.vue';
  import type { CreditMember as CreditMemberData } from '@/features/credits/types';
  const props = withDefaults(
    defineProps<{
      members: CreditMemberData[];
      variant?: 'row' | 'grid';
      ordered?: boolean;
    }>(),
    {
      variant: 'row',
      ordered: false,
    }
  );
  const listTag = computed(() => (props.ordered ? 'ol' : 'ul'));
  const LIST_CLASSES: Record<'row' | 'grid', string> = {
    row: 'flex flex-col gap-2',
    grid: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };
  const gridGapClasses = computed(() => {
    if (props.variant !== 'grid') return '';
    return props.ordered ? 'gap-x-6 gap-y-1' : 'gap-x-2';
  });
  const listClasses = computed(() => [
    LIST_CLASSES[props.variant],
    gridGapClasses.value,
    props.ordered ? 'list-none' : '',
  ]);
</script>
