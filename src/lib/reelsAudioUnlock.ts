/**
 * Tracks whether the user has provided a gesture that unlocks audio.play().
 * Call unlockAudio() from inside a touch/click handler.
 * Call isAudioUnlocked() to check before auto-playing.
 */

let _unlocked = false;
const _callbacks: Array<() => void> = [];

export function isAudioUnlocked(): boolean {
  return _unlocked;
}

export function unlockAudio(): void {
  if (_unlocked) return;
  _unlocked = true;

  // Play a silent wav from gesture context to warm the browser's audio policy.
  // iOS Safari especially needs this before any other Audio.play() will work.
  try {
    const silent = new Audio();
    silent.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
    silent.volume = 0;
    silent.play().then(() => silent.pause()).catch(() => {});
  } catch {
    // no-op
  }

  for (const cb of _callbacks) {
    try {
      cb();
    } catch {
      // no-op
    }
  }
  _callbacks.length = 0;
}

/** Register callback for when audio is unlocked. Fires immediately if already unlocked. */
export function onAudioUnlocked(cb: () => void): () => void {
  if (_unlocked) {
    cb();
    return () => {};
  }
  _callbacks.push(cb);
  return () => {
    const idx = _callbacks.indexOf(cb);
    if (idx >= 0) _callbacks.splice(idx, 1);
  };
}
