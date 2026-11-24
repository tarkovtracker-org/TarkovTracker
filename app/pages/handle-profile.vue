<template>
  <ProfileProgression />
</template>
<script setup lang="ts">
  import { isGameMode } from '@/utils/constants';
  import { isProfileHandle } from '@/utils/profileHandle';
  definePageMeta({
    path: '/@:handle/:mode?',
    validate: ({ params }) =>
      isProfileHandle(params.handle) && (!params.mode || isGameMode(params.mode)),
  });
</script>
