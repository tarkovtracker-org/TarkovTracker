/**
 * Decodes the reviewed screenshot once for every canvas that shows it. The app CSP does not
 * allow `blob:` images, so previews and thumbnails draw this bitmap instead of an object URL.
 */
export function useScreenshotBitmap(image: Ref<Blob | undefined>) {
  const bitmap = shallowRef<ImageBitmap>();
  const failed = ref(false);
  let revision = 0;
  function release() {
    bitmap.value?.close();
    bitmap.value = undefined;
  }
  async function decode(blob: Blob, current: number) {
    try {
      const decoded = await createImageBitmap(blob);
      if (current === revision) bitmap.value = decoded;
      else decoded.close();
    } catch {
      if (current === revision) failed.value = true;
    }
  }
  watch(
    image,
    (blob) => {
      const current = ++revision;
      release();
      failed.value = false;
      if (blob) void decode(blob, current);
    },
    { immediate: true }
  );
  onScopeDispose(() => {
    revision++;
    release();
  });
  return { bitmap, failed };
}
