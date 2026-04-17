/**
 * Shared audio element for the entire app.
 *
 * One HTMLAudioElement is created lazily on first access and reused across
 * every LyricDancePlayer instance. This matters because iOS Safari requires
 * a user gesture to unlock EACH new audio element for unmuted playback.
 * By using one shared element, we only need to unlock it once (via the
 * initial user tap on the page), and every subsequent primary card gets
 * audio that's already unlocked.
 *
 * The element is never destroyed. Engines pause it on teardown but keep
 * it alive for the next primary to use.
 */

let _audio: HTMLAudioElement | null = null;

/**
 * Get the shared audio element. Creates it on first call.
 * The returned element may already have a src set from a previous engine;
 * callers should set the src they need.
 */
export function getSharedAudio(): HTMLAudioElement {
  if (_audio) return _audio;
  const a = new Audio();
  a.preload = "auto";
  a.crossOrigin = "anonymous"; // enables reading PCM for beat analysis if needed
  a.muted = true;
  _audio = a;
  return _audio;
}

/**
 * Set the src on the shared audio. If same src, no-op (avoids reload flash).
 * Always resets currentTime to 0 (or the region start, set by the engine).
 */
export function setSharedAudioSrc(src: string): void {
  const a = getSharedAudio();
  if (a.src === src) return;
  a.src = src;
  // `load()` implicit when src changes; no need to call explicitly
}
