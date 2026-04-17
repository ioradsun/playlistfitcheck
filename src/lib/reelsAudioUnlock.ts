import { getSharedAudio } from "@/lib/sharedAudio";

let _unlocked = false;
const _callbacks: Array<() => void> = [];

export function isAudioUnlocked(): boolean {
  return _unlocked;
}

export function unlockAudio(): void {
  if (_unlocked) return;
  _unlocked = true;

  // Prime the shared audio element from gesture context.
  // Playing it muted unlocks it for all future play() calls, including unmuted ones,
  // across the entire session — without needing another gesture.
  try {
    const audio = getSharedAudio();
    audio.muted = true;
    audio.play().then(() => {
      audio.pause();
      // Leave muted=true so subsequent src changes don't blare
      // until sync logic explicitly unmutes.
    }).catch(() => {
      // Play blocked (gesture not in frame?). _unlocked flag stays true — we tried.
    });
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
