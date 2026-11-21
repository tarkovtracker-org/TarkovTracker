<template>
  <div class="grid gap-4 @min-[32rem]:grid-cols-2 @min-[32rem]:gap-6">
    <div class="space-y-2">
      <h4 class="text-surface-300 text-xs font-medium">{{ text('form.permissions_title') }}</h4>
      <ul v-if="token.permissions.length" class="space-y-1">
        <li
          v-for="permission in token.permissions"
          :key="permission"
          class="text-surface-100 flex items-start gap-2 text-sm"
        >
          <UIcon
            name="i-mdi-check"
            class="text-primary-300 mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <span class="wrap-anywhere">{{ permissionLabels[permission] ?? permission }}</span>
        </li>
      </ul>
      <p v-else class="text-surface-400 text-sm">{{ text('list.no_permissions') }}</p>
    </div>
    <dl
      class="grid content-start gap-y-1.5 border-white/10 @min-[32rem]:border-s @min-[32rem]:ps-6"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <dt class="text-surface-300 text-xs">{{ text('list.last_used') }}</dt>
        <dd class="text-surface-100 text-sm">
          <time v-if="token.lastUsedAt" :datetime="token.lastUsedAt">
            {{ formatDate(token.lastUsedAt) }}
          </time>
          <template v-else>{{ text('list.never') }}</template>
        </dd>
      </div>
      <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <dt class="text-surface-300 text-xs">{{ text('list.lifetime_requests') }}</dt>
        <dd class="text-surface-100 text-sm tabular-nums">
          {{ (token.usageCount ?? 0).toLocaleString(locale) }}
        </dd>
      </div>
      <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <dt class="text-surface-300 text-xs">{{ text('list.created') }}</dt>
        <dd class="text-surface-100 text-sm">
          <time v-if="token.createdAt" :datetime="token.createdAt">
            {{ formatDate(token.createdAt) }}
          </time>
          <template v-else>{{ text('list.unknown_date') }}</template>
        </dd>
      </div>
    </dl>
  </div>
</template>
<script setup lang="ts">
  import type { TokenRow } from '@/types/api';
  defineProps<{ token: TokenRow; permissionLabels: Record<string, string> }>();
  const { t, locale } = useI18n({ useScope: 'global' });
  const text = (key: string) => t(`page.settings.card.apitokens.${key}`);
  const formatDate = (date: string) =>
    new Date(date).toLocaleString(locale?.value, { dateStyle: 'medium', timeStyle: 'short' });
</script>
