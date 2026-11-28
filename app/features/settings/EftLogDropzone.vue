<template>
  <div
    class="rounded-lg border border-dashed p-4 text-center transition-colors"
    :class="dropzoneClass"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <input
      ref="folderInputRef"
      type="file"
      webkitdirectory
      directory
      multiple
      class="hidden"
      @change="onInputChange"
    />
    <input
      ref="filesInputRef"
      type="file"
      accept=".log,.zip"
      multiple
      class="hidden"
      @change="onInputChange"
    />
    <div class="flex flex-col items-center gap-2.5">
      <UButton
        ref="folderButtonRef"
        icon="i-mdi-folder-upload-outline"
        color="info"
        variant="subtle"
        size="md"
        :disabled="disabled"
        @click="openFolderPicker"
      >
        {{ $t('settings.data_management.import_eft_logs_folder_button') }}
      </UButton>
      <p class="text-surface-400 text-xs">
        {{ $t('settings.log_import.dropzone_hint') }}
        <button
          type="button"
          class="text-info-300 hover:text-info-200 cursor-pointer font-medium underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="disabled"
          @click="openFilesPicker"
        >
          {{ $t('settings.log_import.browse_files_link') }}
        </button>
      </p>
    </div>
  </div>
</template>
<script setup lang="ts">
  const props = defineProps<{ disabled?: boolean }>();
  const emit = defineEmits<{ selectFiles: [files: File[]] }>();
  const folderInputRef = ref<HTMLInputElement | null>(null);
  const filesInputRef = ref<HTMLInputElement | null>(null);
  const folderButtonRef = ref<{ $el?: HTMLElement } | null>(null);
  let disposed = false;
  onScopeDispose(() => {
    disposed = true;
  });
  const dragDepth = ref(0);
  const isDragging = computed(() => dragDepth.value > 0 && !props.disabled);
  const dropzoneClass = computed(() =>
    isDragging.value
      ? 'border-info-400/75 bg-info-500/10'
      : 'border-white/15 bg-surface-950/50 hover:border-white/25'
  );
  function openFolderPicker() {
    if (props.disabled) return;
    folderInputRef.value?.click();
  }
  function openFilesPicker() {
    if (props.disabled) return;
    filesInputRef.value?.click();
  }
  function onInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (files.length > 0) emit('selectFiles', files);
  }
  function onDragEnter() {
    if (props.disabled) return;
    dragDepth.value += 1;
  }
  function onDragOver() {
    if (props.disabled || dragDepth.value > 0) return;
    dragDepth.value = 1;
  }
  function onDragLeave() {
    dragDepth.value = Math.max(0, dragDepth.value - 1);
  }
  type DroppedEntry = {
    isFile: boolean;
    isDirectory: boolean;
    name: string;
    fullPath?: string;
    file?: (resolve: (file: File) => void, reject: (err: unknown) => void) => void;
    createReader?: () => {
      readEntries: (
        resolve: (entries: DroppedEntry[]) => void,
        reject: (err: unknown) => void
      ) => void;
    };
  };
  function attachRelativePath(file: File, relativePath: string): File {
    if (!relativePath || file.webkitRelativePath) return file;
    try {
      Object.defineProperty(file, 'webkitRelativePath', {
        configurable: true,
        value: relativePath.replace(/^\/+/, ''),
      });
    } catch {
      return file;
    }
    return file;
  }
  async function readAllDirectoryEntries(entry: DroppedEntry): Promise<DroppedEntry[]> {
    const reader = entry.createReader?.();
    if (!reader) return [];
    const entries: DroppedEntry[] = [];
    while (true) {
      const batch = await new Promise<DroppedEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject)
      );
      if (batch.length === 0) break;
      entries.push(...batch);
    }
    return entries;
  }
  async function collectEntryFiles(entry: DroppedEntry, prefix: string): Promise<File[]> {
    if (entry.isFile && entry.file) {
      const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
      const relPath = entry.fullPath || (prefix ? `${prefix}/${entry.name}` : entry.name);
      return [attachRelativePath(file, relPath)];
    }
    if (!entry.isDirectory) return [];
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    const children = await readAllDirectoryEntries(entry);
    const nested = await Promise.all(children.map((child) => collectEntryFiles(child, nextPrefix)));
    return nested.flat();
  }
  async function extractDroppedFiles(dataTransfer: DataTransfer | null): Promise<File[]> {
    if (!dataTransfer) return [];
    const items = Array.from(dataTransfer.items ?? []);
    const entries = items
      .map((item) => (item.webkitGetAsEntry?.() ?? null) as DroppedEntry | null)
      .filter((entry): entry is DroppedEntry => entry !== null);
    if (entries.length > 0) {
      const collected = await Promise.all(entries.map((entry) => collectEntryFiles(entry, '')));
      return collected.flat();
    }
    return Array.from(dataTransfer.files ?? []);
  }
  async function onDrop(event: DragEvent) {
    dragDepth.value = 0;
    if (props.disabled) return;
    const files = await extractDroppedFiles(event.dataTransfer);
    if (!disposed && !props.disabled && files.length > 0) emit('selectFiles', files);
  }
  defineExpose({
    focusFolderButton: () => folderButtonRef.value?.$el?.focus(),
  });
</script>
