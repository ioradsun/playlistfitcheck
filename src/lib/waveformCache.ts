/**
 * Two-tier cache for waveform peak data.
 *
 * Tier 1: In-memory Map — survives React remounts within a session.
 * Tier 2: localStorage — survives page reloads and cold returns.
 *
 * Keyed by stable identity: savedId (preferred) or audioUrl.
 * Blob URLs are NOT cached — they're session-local and the File they
 * reference is ephemeral; there's no way to address them later.
 *
 * Peaks are ~200 floats per song (~1.6KB). A cache of 5,000 songs
 * fits comfortably in localStorage's 5-10MB quota.
 */

import type { WaveformData } from "@/hooks/useAudioEngine";

const MEMORY_CACHE = new Map<string, WaveformData>();
const STORAGE_PREFIX = "wf:v1:";
const MAX_STORAGE_ENTRIES = 500; // cap to keep localStorage bounded; LRU-evict oldest

export function getWaveformCacheKey(args: {
  savedId?: string | null;
  audioUrl?: string | null;
}): string | null {
  const { savedId, audioUrl } = args;
  if (savedId) return `id:${savedId}`;
  if (audioUrl && !audioUrl.startsWith("blob:")) return `url:${audioUrl}`;
  return null;
}

export function getCachedWaveform(key: string | null): WaveformData | null {
  if (!key) return null;

  const inMemory = MEMORY_CACHE.get(key);
  if (inMemory) return inMemory;

  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed
      && typeof parsed.duration === "number"
      && Array.isArray(parsed.peaks)
      && parsed.peaks.length > 0
    ) {
      const hydrated: WaveformData = {
        peaks: parsed.peaks,
        duration: parsed.duration,
      };
      MEMORY_CACHE.set(key, hydrated); // promote to memory tier
      return hydrated;
    }
  } catch {
    // localStorage disabled, quota exceeded, or parse error — silent fallback
  }

  return null;
}

export function setCachedWaveform(key: string | null, data: WaveformData): void {
  if (!key) return;
  if (!data || !Array.isArray(data.peaks) || data.peaks.length === 0) return;

  MEMORY_CACHE.set(key, data);

  // Persist to localStorage async-ish (we do it sync but catch errors silently).
  try {
    const payload = JSON.stringify({ peaks: data.peaks, duration: data.duration });
    localStorage.setItem(STORAGE_PREFIX + key, payload);
    enforceStorageCap();
  } catch {
    // Quota exceeded or storage disabled — no-op, memory cache still works
  }
}

/**
 * Best-effort bound on localStorage entries. If we're over the cap, drop the
 * oldest-looking N entries. Cheap linear scan; only runs on writes.
 */
function enforceStorageCap(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    if (keys.length <= MAX_STORAGE_ENTRIES) return;

    // No insertion-order metadata in localStorage; drop in iteration order.
    // This is best-effort; an LRU would need timestamps. 500-entry cap rarely hits.
    const toRemove = keys.slice(0, keys.length - MAX_STORAGE_ENTRIES);
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    // no-op
  }
}
