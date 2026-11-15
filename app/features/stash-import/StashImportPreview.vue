<template>
  <div class="space-y-4">
    <h3 class="font-semibold">
      {{ $t('stash_import.preview_title') }} · {{ preview.mode.toUpperCase() }}
    </h3>
    <p class="text-surface-400 text-sm">{{ $t('stash_import.preview_help') }}</p>
    <div class="max-h-96 overflow-auto rounded border border-white/10">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="bg-surface-800">
            <th class="p-3">{{ $t('stash_import.requirement') }}</th>
            <th class="p-3">{{ $t('stash_import.before') }}</th>
            <th class="p-3">{{ $t('stash_import.after') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="change in preview.changes"
            :key="`${change.type}:${change.id}`"
            class="border-t border-white/5"
          >
            <td class="p-3">{{ itemName(change.itemId) }} · {{ change.label }}</td>
            <td class="p-3">{{ change.before }}</td>
            <td
              class="p-3 font-semibold"
              :class="change.count < change.before ? 'text-warning-300' : 'text-success-300'"
            >
              {{ change.count }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!preview.changes.length" class="p-3">{{ $t('stash_import.no_changes') }}</p>
    </div>
    <p class="text-surface-400 text-sm">
      {{ $t('stash_import.excess', { count: preview.excess }) }}
    </p>
    <label
      v-if="hasDecreases"
      class="border-warning-400/30 text-warning-300 flex items-start gap-3 rounded border p-3 text-sm"
    >
      <input v-model="allowDecreases" type="checkbox" class="mt-1" />
      {{ $t('stash_import.confirm_decreases') }}
    </label>
    <p v-if="stale" role="alert" class="text-warning-300">
      {{ $t('stash_import.errors.stale') }}
    </p>
    <div class="flex flex-wrap gap-2">
      <UButton
        v-if="!uncertain"
        :disabled="stale || !preview.changes.length || (hasDecreases && !allowDecreases)"
        :loading="saving"
        @click="$emit('save')"
      >
        {{ $t('stash_import.apply') }}
      </UButton>
      <UButton v-else :loading="saving" @click="$emit('recover')">
        {{ $t('stash_import.check_receipt') }}
      </UButton>
      <UButton variant="soft" :disabled="saving" @click="$emit('back')">
        {{ $t('stash_import.back') }}
      </UButton>
    </div>
  </div>
</template>
<script setup lang="ts">
  import type { StashImportPreview } from '@/features/stash-import/useStashImport';
  defineProps<{
    preview: StashImportPreview;
    itemName: (id: string) => string;
    hasDecreases: boolean;
    stale: boolean;
    uncertain: boolean;
    saving: boolean;
  }>();
  const allowDecreases = defineModel<boolean>('allowDecreases', { required: true });
  defineEmits<{ save: []; recover: []; back: [] }>();
</script>
