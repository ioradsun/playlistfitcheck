/**
 * SessionAudioCache — bounded in-memory cache for session-scoped audio File objects.
 *
 * Lifetime:
 * - Survives React remounts/navigation in a single browser tab.
 * - Cleared on full page reload/tab close.
 *
 * Eviction:
 * - LRU by last access.
 * - Bounded by both max entry count and total estimated bytes.
 * - Optional per-entry TTL for temporary project hydration.
 */

interface CacheEntry {
  file: File;
  estimatedBytes: number;
  expiresAt: number | null;
  lastAccessedAt: number;
}

interface SetOptions {
  ttlMs?: number;
  estimatedBytes?: number;
}

const DEFAULT_MAX_ENTRIES = 16;
const DEFAULT_MAX_TOTAL_BYTES = 180 * 1024 * 1024; // ~180MB soft cap per tab session.

class SessionAudioCache {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly maxEntries = DEFAULT_MAX_ENTRIES,
    private readonly maxTotalBytes = DEFAULT_MAX_TOTAL_BYTES,
  ) {}

  private makeKey(tool: string, id: string): string {
    return `${tool}::${id}`;
  }

  private now(): number {
    return Date.now();
  }

  private isExpired(entry: CacheEntry, at = this.now()): boolean {
    return entry.expiresAt !== null && entry.expiresAt <= at;
  }

  private getTotalEstimatedBytes(): number {
    let total = 0;
    for (const entry of this.cache.values()) total += entry.estimatedBytes;
    return total;
  }

  private pruneExpired(at = this.now()): void {
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry, at)) this.cache.delete(key);
    }
  }

  private evictToFit(): void {
    this.pruneExpired();
    while (
      this.cache.size > this.maxEntries ||
      this.getTotalEstimatedBytes() > this.maxTotalBytes
    ) {
      const lru = this.cache.entries().next().value as [string, CacheEntry] | undefined;
      if (!lru) break;
      this.cache.delete(lru[0]);
    }
  }

  set(tool: string, id: string, file: File, options: SetOptions = {}): void {
    const key = this.makeKey(tool, id);
    const now = this.now();
    const entry: CacheEntry = {
      file,
      estimatedBytes: Math.max(1, options.estimatedBytes ?? file.size ?? 1),
      expiresAt: typeof options.ttlMs === "number" ? now + Math.max(0, options.ttlMs) : null,
      lastAccessedAt: now,
    };

    this.cache.delete(key);
    this.cache.set(key, entry);
    this.evictToFit();
  }

  get(tool: string, id: string): File | undefined {
    const key = this.makeKey(tool, id);
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return undefined;
    }

    entry.lastAccessedAt = this.now();
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.file;
  }

  has(tool: string, id: string): boolean {
    return this.get(tool, id) !== undefined;
  }

  remove(tool: string, id: string): void {
    this.cache.delete(this.makeKey(tool, id));
  }

  removeByPrefix(prefix: string): void {
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  clearTool(tool: string): void {
    this.removeByPrefix(`${tool}::`);
  }

  clearProject(tool: string, projectId: string): void {
    this.removeByPrefix(`${tool}::${projectId}`);
  }

  clearAll(): void {
    this.cache.clear();
  }
}

export const sessionAudio = new SessionAudioCache();
