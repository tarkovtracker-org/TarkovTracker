<template>
  <div class="border-t border-white/10 pt-4">
    <h3 class="font-semibold">{{ $t('stash_import.targets') }}</h3>
    <p class="text-surface-400 mt-1 text-sm">{{ $t('stash_import.reconcile_help') }}</p>
    <p v-if="remaining" class="text-warning-300 mt-2 text-sm">
      {{ $t('stash_import.review_first') }}
    </p>
    <p v-else-if="!validTotals" role="alert" class="text-error-300 mt-2 text-sm">
      {{ $t('stash_import.errors.quantity') }}
    </p>
    <div v-else class="mt-3 max-h-64 overflow-y-auto rounded border border-white/10">
      <label
        v-for="target in availableTargets"
        :key="target.key"
        class="flex items-center gap-3 border-b border-white/5 p-3 text-sm"
      >
        <input v-model="selected" type="checkbox" :value="target.key" />
        <span class="min-w-0 flex-1">
          {{ itemName(target.itemId) }} · {{ target.label }}
          <span v-if="target.need.foundInRaid" class="text-warning-300">
            ({{ $t('common.fir') }})
          </span>
        </span>
        <span>{{ target.current }} / {{ target.need.count }}</span>
      </label>
      <p v-if="!availableTargets.length" class="p-3 text-sm">
        {{ $t('stash_import.no_targets') }}
      </p>
    </div>
    <p class="text-surface-400 mt-2 text-xs">{{ $t('stash_import.eligibility_help') }}</p>
    <p v-if="!signedIn" class="text-warning-300 mt-2 text-sm">
      {{ $t('stash_import.errors.sign_in') }}
    </p>
    <UButton
      class="mt-3"
      :loading="preparing"
      :disabled="!validTotals || remaining > 0 || !selected.length || !signedIn"
      @click="$emit('preview')"
    >
      {{ $t('stash_import.preview') }}
    </UButton>
  </div>
</template>
<script setup lang="ts">
  import type { ImportTarget } from '@/features/stash-import/useStashImport';
  defineProps<{
    availableTargets: ImportTarget[];
    validTotals: boolean;
    remaining: number;
    itemName: (id: string) => string;
    signedIn: boolean;
    preparing: boolean;
  }>();
  const selected = defineModel<string[]>({ required: true });
  defineEmits<{ preview: [] }>();
</script>
