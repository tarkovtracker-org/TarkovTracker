import { checkDimensions } from '@/utils/stashScan/imageHeader';
import { scanError } from '@/utils/stashScan/types';
function stopTracks(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}
async function encodeFrame(video: HTMLVideoElement): Promise<File> {
  const { videoWidth, videoHeight } = video;
  checkDimensions(videoWidth, videoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = videoWidth;
  canvas.height = videoHeight;
  const context = canvas.getContext('2d');
  if (!context) throw scanError('window_frame');
  context.drawImage(video, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw scanError('window_frame');
  return new File([blob], 'stash-window.png', { type: blob.type });
}
const frameError = (failure: unknown) =>
  failure instanceof Error && failure.message === 'stash_import.errors.image_size'
    ? failure.message
    : 'stash_import.errors.window_frame';
export function useStashWindowCapture() {
  const stream = shallowRef<MediaStream>();
  const requesting = ref(false);
  const error = ref('');
  let disposed = false;
  function stop() {
    if (!stream.value) return;
    stream.value.getVideoTracks()[0]?.removeEventListener('ended', stop);
    stopTracks(stream.value);
    stream.value = undefined;
  }
  function accept(capture: MediaStream) {
    if (disposed) {
      stopTracks(capture);
      return;
    }
    const track = capture.getVideoTracks()[0];
    if (track?.getSettings().displaySurface !== 'window') {
      stopTracks(capture);
      error.value = 'stash_import.errors.window_only';
      return;
    }
    stream.value = capture;
    track.addEventListener('ended', stop, { once: true });
  }
  async function share() {
    if (requesting.value || stream.value) return;
    error.value = '';
    requesting.value = true;
    try {
      accept(
        await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'window' },
          audio: false,
        })
      );
    } catch {
      error.value = 'stash_import.errors.window_share';
    } finally {
      requesting.value = false;
    }
  }
  function currentFrame(video: HTMLVideoElement) {
    const track = stream.value?.getVideoTracks()[0];
    return (
      track?.readyState === 'live' &&
      !track.muted &&
      video.srcObject === stream.value &&
      video.readyState >= 2
    );
  }
  async function frame(video: HTMLVideoElement): Promise<File | undefined> {
    if (!currentFrame(video)) {
      error.value = 'stash_import.errors.window_frame';
      return;
    }
    const capture = stream.value;
    error.value = '';
    try {
      const file = await encodeFrame(video);
      if (stream.value === capture) return file;
    } catch (failure) {
      error.value = frameError(failure);
    }
  }
  onScopeDispose(() => {
    disposed = true;
    stop();
  });
  return { stream, requesting, error, share, stop, frame };
}
