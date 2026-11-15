/**
 * Decodes the reviewed screenshot once for every canvas that shows it. The app CSP does not
 * allow `blob:` images, so previews and thumbnails draw this bitmap instead of an object URL.
 *
 * A new image keeps the previous frame on screen until it has decoded, so region edits and
 * rescans never flash blank. A missing image releases the bitmap immediately.
 */
export function useScreenshotBitmap(image: MaybeRefOrGetter<Blob | undefined>) {
  const bitmap = shallowRef<ImageBitmap>();
  const failed = ref(false);
  let revision = 0;
  function swap(next: ImageBitmap | undefined) {
    const previous = bitmap.value;
    bitmap.value = next;
    // Children only redraw from the current value, so the old frame is never drawn again.
    previous?.close();
  }
  async function decode(blob: Blob, current: number) {
    try {
      const decoded = await createImageBitmap(blob);
      if (current === revision) swap(decoded);
      else decoded.close();
    } catch {
      if (current === revision) failed.value = true;
    }
  }
  watch(
    () => toValue(image),
    (blob) => {
      const current = ++revision;
      failed.value = false;
      if (blob) void decode(blob, current);
      else swap(undefined);
    },
    { immediate: true }
  );
  onScopeDispose(() => {
    revision++;
    swap(undefined);
  });
  return { bitmap, failed };
}
