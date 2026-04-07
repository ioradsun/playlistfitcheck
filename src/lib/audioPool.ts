const POOL_SIZE = 3;

interface AudioSlot {
  audio: HTMLAudioElement;
  heldBy: string | null;
}

let slots: AudioSlot[] | null = null;

function getSlots(): AudioSlot[] {
  if (slots) return slots;
  slots = Array.from({ length: POOL_SIZE }, () => {
    const audio = new Audio();
    audio.preload = "none";
    audio.muted = true;
    return { audio, heldBy: null };
  });
  return slots;
}

export function acquireAudio(postId: string, audioUrl: string): HTMLAudioElement | null {
  const pool = getSlots();
  const existing = pool.find((slot) => slot.heldBy === postId);
  if (existing) return existing.audio;

  const free = pool.find((slot) => !slot.heldBy);
  if (!free) return null;

  free.heldBy = postId;
  free.audio.src = audioUrl;
  free.audio.muted = true;
  free.audio.preload = "auto";
  free.audio.load();
  return free.audio;
}

export function releaseAudio(postId: string): void {
  const pool = getSlots();
  const slot = pool.find((candidate) => candidate.heldBy === postId);
  if (!slot) return;
  slot.audio.pause();
  slot.audio.muted = true;
  slot.audio.removeAttribute("src");
  slot.audio.load();
  slot.heldBy = null;
}

export function evictLeastImportant(excludePostId: string): string | null {
  const pool = getSlots();
  const victim = pool.find((slot) => slot.heldBy && slot.heldBy !== excludePostId);
  if (!victim?.heldBy) return null;
  const freedPostId = victim.heldBy;
  releaseAudio(freedPostId);
  return freedPostId;
}

/**
 * Silently plays all pool elements within a user gesture.
 * This "blesses" the 3 elements for iOS Safari, allowing subsequent
 * programmatic play() calls (e.g., from setTimeout) to succeed.
 */
export function primeAudioPool(): void {
  const pool = getSlots();
  for (const slot of pool) {
    if (slot.audio.paused) {
      slot.audio.muted = true;
      slot.audio.play().catch(() => {});
    }
  }
}
