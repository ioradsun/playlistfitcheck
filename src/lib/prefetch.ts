import { supabase } from "@/integrations/supabase/client";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";

/**
 * Prefetch cache — fires immediately at module evaluation time.
 * Consumed once by the corresponding component, then cleared.
 *
 * Embed routes (3-segment paths like /:artist/:song/lyric-dance) skip
 * feed, siteCopy, auth, and SongFitTab prefetches entirely — those
 * pages never use them.
 */

// ── Route detection (runs once at module eval) ──────────────────────────────
const _path = typeof window !== "undefined" ? window.location.pathname : "";
const _segments = _path.replace(/^\//, "").split("/").filter(Boolean);
const _isEmbedRoute = _segments.length === 3;

// ── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_PREFIX = "tfm:";
const CACHE_TTL_MS = 0;
const DANCE_CACHE_PREFIX = "dance:";
const DANCE_CACHE_TTL_MS = 0;

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

function danceCacheKey(artistSlug: string, songSlug: string): string {
  return `${CACHE_PREFIX}${DANCE_CACHE_PREFIX}${artistSlug}/${songSlug}`;
}

export function cacheDanceData(artistSlug: string, songSlug: string, data: any): void {
  try {
    const entry: CacheEntry<any> = { data, ts: Date.now() };
    localStorage.setItem(danceCacheKey(artistSlug, songSlug), JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable — silent fail
  }
}

export function readCachedDanceData(artistSlug: string, songSlug: string): any | null {
  try {
    const raw = localStorage.getItem(danceCacheKey(artistSlug, songSlug));
    if (!raw) return null;
    const entry: CacheEntry<any> = JSON.parse(raw);
    if (Date.now() - entry.ts > DANCE_CACHE_TTL_MS) {
      localStorage.removeItem(danceCacheKey(artistSlug, songSlug));
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
// Embed routes don't mount AuthProvider, skip the round-trip.

export let authPrefetch: ReturnType<typeof supabase.auth.getSession> | null =
  _isEmbedRoute ? null : supabase.auth.getSession();

export function consumeAuthPrefetch() {
  const p = authPrefetch;
  authPrefetch = null;
  return p;
}

// ── Feed posts prefetch — consumed by SongFitFeed on first mount ─────────────

const FEED_PAGE_SIZE = 20;
const FEED_COLUMNS =
  "*, profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address, is_verified)";

export let feedPrefetch: Promise<{ data: any[] | null; error: any }> | null =
  _isEmbedRoute
    ? null
    : Promise.resolve(
        supabase
          .from("feed_posts" as any)
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
  feedPrefetch = null;
  return p;
}

// ── Lyric dance prefetch — fires IN PARALLEL with feed posts ────────────────
const _cachedFeedForLyric = !_isEmbedRoute ? cacheRead<any[]>("feed_posts") : null;
const _cachedLyricData = !_isEmbedRoute ? cacheRead<Record<string, any>>("lyric_data") : null;
const _topLyricIds = (_cachedFeedForLyric ?? [])
  .filter((p: any) => p.project_id)
  .map((p: any) => p.project_id as string)
  .filter((id) => !_cachedLyricData?.[id]?.cinematic_direction);

export let lyricDataPrefetch: Promise<{ data: any[] | null; error: any }> | null =
  _topLyricIds.length > 0
    ? Promise.resolve(
        supabase
          .from("lyric_projects" as any)
          .select(LYRIC_DANCE_COLUMNS)
          .in("id", _topLyricIds)
      )
    : null;

export function consumeLyricDataPrefetch() {
  const p = lyricDataPrefetch;
  lyricDataPrefetch = null;
  return p;
}

// ── Site copy prefetch — consumed by SiteCopyProvider ────────────────────────

export let siteCopyPrefetch: Promise<{ data: any; error: any }> | null =
  _isEmbedRoute
    ? null
    : Promise.resolve(
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
  siteCopyPrefetch = null;
  return p;
}

if (!_isEmbedRoute) {
  import("./routePrefetch").then(({ SongFitTabImport }) => void SongFitTabImport());
  void import("../MainAppShell");
}

void import("@/engine/LyricDancePlayer");

interface ShareablePrefetchResult {
  data: Promise<{ data: any; error: any }>;
  audioPreloaded: boolean;
}

let shareableDancePrefetch: ShareablePrefetchResult | null = null;

if (_segments.length === 3 && _segments[2] === "lyric-dance") {
  const [artistSlug, songSlug] = _segments;
  const cached = readCachedDanceData(artistSlug, songSlug);

  const networkPromise = Promise.resolve(
    supabase
      .from("lyric_projects" as any)
      .select(LYRIC_DANCE_COLUMNS)
      .eq("artist_slug", artistSlug)
      .eq("url_slug", songSlug)
      .maybeSingle(),
  ).then((result: any) => {
    if (result.data) {
      cacheDanceData(artistSlug, songSlug, result.data);
      if (result.data.audio_url) {
        const audio = new Audio();
        audio.preload = "auto";
        audio.src = result.data.audio_url;
      }
      const firstImg = result.data.section_images?.[0];
      if (firstImg) {
        const img = new Image();
        img.src = firstImg;
      }
    }
    return result;
  });

  const dataPromise = cached
    ? Promise.resolve({ data: cached, error: null })
    : networkPromise;

  if (cached?.audio_url) {
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = cached.audio_url;
  }

  if (cached) {
    void networkPromise;
  }

  shareableDancePrefetch = { data: dataPromise, audioPreloaded: true };
}

export function consumeShareableDancePrefetch() {
  const p = shareableDancePrefetch;
  shareableDancePrefetch = null;
  return p;
}



/** True when the current page is a lightweight embed/shareable route. */
export const isEmbedRoute = _isEmbedRoute;
