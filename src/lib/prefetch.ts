import { supabase } from "@/integrations/supabase/client";

/**
 * Prefetch cache — fires immediately at module evaluation time.
 * Consumed once by the corresponding component, then cleared.
 *
 * Stale-while-revalidate: if localStorage has a recent cache entry,
 * consumers can seed their initial state synchronously. The network
 * fetch still fires every time and writes back to cache on success.
 */

// ── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_PREFIX = "tfm:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — stale after this

interface CacheEntry<T> {
  data: T;
  ts: number; // Date.now() when written
}

export function cacheWrite<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, ts: Date.now() };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable — silent fail
  }
}

function cacheRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

// ── Sync cache getters (consumed by component initializers) ──────────────────

/** Returns cached site_copy.copy_json or null. Sync, no network. */
export function getCachedSiteCopy(): Record<string, any> | null {
  return cacheRead<Record<string, any>>("site_copy");
}

/** Returns cached feed posts or null. Sync, no network. */
export function getCachedFeed(): any[] | null {
  return cacheRead<any[]>("feed_posts");
}

/** Returns cached lyric dance data keyed by ID, or null. Sync, no network. */
export function getCachedLyricData(): Record<string, any> | null {
  return cacheRead<Record<string, any>>("lyric_data");
}

// ── Auth session prefetch — consumed by AuthProvider ─────────────────────────

export let authPrefetch: ReturnType<typeof supabase.auth.getSession> | null =
  supabase.auth.getSession();

export function consumeAuthPrefetch() {
  const p = authPrefetch;
  authPrefetch = null; // one-shot — subsequent calls go through normal path
  return p;
}

// ── Feed posts prefetch — consumed by SongFitFeed on first mount ─────────────

const FEED_PAGE_SIZE = 20;
const FEED_COLUMNS =
  "*, profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address, is_verified)";

export let feedPrefetch: Promise<{ data: any[] | null; error: any }> | null =
  Promise.resolve(
    supabase
      .from("songfit_posts")
      .select(FEED_COLUMNS)
      .eq("status", "live")
      .limit(FEED_PAGE_SIZE)
      .order("created_at", { ascending: false })
  ).then((result) => {
    if (result.data && result.data.length > 0) {
      cacheWrite("feed_posts", result.data);
    }
    return result;
  });

export function consumeFeedPrefetch() {
  const p = feedPrefetch;
  feedPrefetch = null; // one-shot
  return p;
}

// ── Site copy prefetch — consumed by SiteCopyProvider ────────────────────────

export let siteCopyPrefetch: Promise<{ data: any; error: any }> | null =
  Promise.resolve(
    supabase
      .from("site_copy")
      .select("copy_json")
      .limit(1)
      .single()
  ).then((result) => {
    if (result.data?.copy_json) {
      cacheWrite("site_copy", result.data.copy_json);
    }
    return result;
  });

export function consumeSiteCopyPrefetch() {
  const p = siteCopyPrefetch;
  siteCopyPrefetch = null; // one-shot
  return p;
}

// ── Chunk prefetch — SongFitTab downloads in parallel with data ──────────────
// (added by prior optimization — keep this)
import { SongFitTabImport } from "./routePrefetch";
void SongFitTabImport();

// Lyric engine chunk — download in parallel so it's cached before first InStudio card boots.
// This resolves from Vite's "lyric-engine" manualChunk created in vite.config.ts.
void import("@/engine/LyricDancePlayer");
