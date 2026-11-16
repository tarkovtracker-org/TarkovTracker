<template>
  <div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
    <div
      v-if="busy"
      class="border-surface-600 bg-surface-850 flex flex-col items-center gap-4 rounded-lg border px-6 py-12 text-center"
      role="status"
      aria-live="polite"
    >
      <UIcon name="i-mdi-image-search-outline" class="text-primary-300 size-10 animate-pulse" />
      <p class="text-surface-100 font-semibold">{{ $t(`stash_import.stage_${stage}`) }}</p>
      <div class="bg-surface-700 h-2 w-full max-w-sm overflow-hidden rounded-full">
        <div
          class="bg-primary-500 h-full rounded-full transition-[width] duration-300"
          :style="{ width: `${percent}%` }"
        />
      </div>
      <UButton variant="soft" color="neutral" @click="$emit('cancel')">
        {{ $t('common.cancel') }}
      </UButton>
    </div>
    <div
      v-else
      data-testid="stash-dropzone"
      class="flex cursor-pointer flex-col items-center gap-4 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors sm:py-14"
      :class="
        dragging
          ? 'border-primary-400 bg-primary-500/10'
          : 'border-surface-600 bg-surface-850 hover:border-surface-500'
      "
      @click="browse"
    >
      <UIcon
        :name="dragging ? 'i-mdi-tray-arrow-down' : 'i-mdi-image-plus-outline'"
        class="text-primary-300 size-12"
      />
      <div class="space-y-1">
        <p class="text-surface-100 text-base font-semibold">
          {{ $t(dragging ? 'stash_import.drop_now' : 'stash_import.drop_title') }}
        </p>
        <p class="text-surface-400 text-sm">
          {{ $t('stash_import.drop_hint', { shortcut: pasteShortcut }) }}
        </p>
      </div>
      <div class="flex flex-wrap justify-center gap-2" @click.stop>
        <UButton icon="i-mdi-upload" :disabled="disabled" @click="browse">
          {{ $t('stash_import.choose_image') }}
        </UButton>
        <UButton
          icon="i-mdi-image-outline"
          variant="soft"
          color="neutral"
          :disabled="disabled"
          :loading="demoLoading"
          @click="$emit('demo')"
        >
          {{ $t('stash_import.try_demo') }}
        </UButton>
        <UButton
          v-if="canReadClipboard"
          icon="i-mdi-content-paste"
          variant="soft"
          color="neutral"
          :disabled="disabled"
          @click="$emit('pasteRequest')"
        >
          {{ $t('stash_import.paste_image') }}
        </UButton>
      </div>
      <input
        ref="input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        class="sr-only"
        tabindex="-1"
        :aria-label="$t('stash_import.choose_image')"
        :disabled="disabled"
        @change="changed"
      />
    </div>
    <ul class="text-surface-400 grid gap-2 text-sm sm:grid-cols-3">
      <li v-for="tip in tips" :key="tip.key" class="bg-surface-850 flex gap-2 rounded-md p-3">
        <UIcon :name="tip.icon" class="text-surface-300 mt-0.5 size-4 shrink-0" />
        <span>{{ $t(`stash_import.tip_${tip.key}`) }}</span>
      </li>
    </ul>
  </div>
</template>
<script setup lang="ts">
  const props = defineProps<{
    busy: boolean;
    disabled: boolean;
    dragging: boolean;
    stage: string;
    completed: number;
    total: number;
    demoLoading?: boolean;
  }>();
  const emit = defineEmits<{ files: [files: File[]]; pasteRequest: []; cancel: []; demo: [] }>();
  const input = ref<HTMLInputElement>();
  const tips = [
    { key: 'open', icon: 'i-mdi-view-grid-outline' },
    { key: 'tooltips', icon: 'i-mdi-cursor-default-outline' },
    { key: 'private', icon: 'i-mdi-shield-lock-outline' },
  ];
  const canReadClipboard = ref(false);
  const pasteShortcut = ref('Ctrl+V');
  onMounted(() => {
    canReadClipboard.value = typeof navigator.clipboard?.read === 'function';
    if (/Mac|iPhone|iPad/.test(navigator.platform)) pasteShortcut.value = '⌘V';
  });
  const percent = computed(() =>
    props.total > 0 ? Math.min(100, Math.round((props.completed / props.total) * 100)) : 0
  );
  function browse() {
    if (!props.disabled) input.value?.click();
  }
  function changed(event: Event) {
    const target = event.target as HTMLInputElement;
    emit('files', Array.from(target.files ?? []));
    target.value = '';
  }
</script>
