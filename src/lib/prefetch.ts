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
  feedPrefetch = null;
  return p;
}

// ── Lyric dance prefetch — fires IN PARALLEL with feed posts ────────────────
// On return visits, localStorage has cached feed posts with lyric_dance_ids.
// We read those IDs at module eval and fire a FULL-column query for all uncached
// lyric dances. This eliminates the entire Phase 1 → Phase 2 waterfall and
// fixes a bug where Phase 2 data never reached React state on first visit.
//
// First visit (no cache): null — falls back to parallel queries in useFeedPosts.
// Return visit: full lyric data arrives alongside feed posts — ~700ms faster.

const _cachedFeedForLyric = !_isEmbedRoute ? cacheRead<any[]>("feed_posts") : null;
const _cachedLyricData = !_isEmbedRoute ? cacheRead<Record<string, any>>("lyric_data") : null;
const _topLyricIds = (_cachedFeedForLyric ?? [])
  .filter((p: any) => p.lyric_dance_id)
  .map((p: any) => p.lyric_dance_id as string)
  .filter((id) => !_cachedLyricData?.[id]?.cinematic_direction);

export let lyricDataPrefetch: Promise<{ data: any[] | null; error: any }> | null =
  _topLyricIds.length > 0
    ? Promise.resolve(
        supabase
          .from("shareable_lyric_dances" as any)
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

// ── Chunk prefetch — only needed for main app routes ─────────────────────────
if (!_isEmbedRoute) {
  import("./routePrefetch").then(({ SongFitTabImport }) => void SongFitTabImport());
  // Eagerly warm the main app shell chunk so it's cached before React lazy-loads it.
  // This eliminates the sequential waterfall: main.tsx → (wait) → MainAppShell → (wait) → Index
  void import("../MainAppShell");
}

// Lyric engine chunk — always needed (both embed and main app use it)
void import("@/engine/LyricDancePlayer");


// ── Shareable page prefetch — fires at module eval for direct navigations ────
// Reads slugs from window.location.pathname. Only fires on matching routes.
// Consumed once by ShareableLyricDance / ShareableHook, then cleared.

interface ShareablePrefetchResult {
  data: Promise<{ data: any; error: any }>;
  audioPreloaded: boolean;
}

let shareableDancePrefetch: ShareablePrefetchResult | null = null;
let shareableHookPrefetch: Promise<{ data: any; error: any }> | null = null;

if (_segments.length === 3 && _segments[2] === "lyric-dance") {
  const [artistSlug, songSlug] = _segments;
  const dataPromise = Promise.resolve(supabase
    .from("shareable_lyric_dances" as any)
    .select(LYRIC_DANCE_COLUMNS)
    .eq("artist_slug", artistSlug)
    .eq("song_slug", songSlug)
    .maybeSingle())
    .then((result: any) => {
      if (result.data?.audio_url) {
        const audio = new Audio();
        audio.preload = "auto";
        audio.src = result.data.audio_url;

        const firstImg = result.data.section_images?.[0];
        if (firstImg) {
          const img = new Image();
          img.src = firstImg;
        }
      }
      return result;
    });
  shareableDancePrefetch = { data: dataPromise, audioPreloaded: true };
} else if (
  _segments.length === 3 &&
  _segments[2] !== "lyric-dance" &&
  _segments[2] !== "claim-page"
) {
  const [artistSlug, songSlug, hookSlug] = _segments;
  shareableHookPrefetch = Promise.resolve(supabase
    .from("shareable_hooks" as any)
    .select(
      "id,battle_id,hook_start,hook_end,hook_slug,hook_phrase,artist_slug,song_slug,artist_name,song_name,audio_url,palette,vote_count,battle_position,hook_label,user_id"
    )
    .eq("artist_slug", artistSlug)
    .eq("song_slug", songSlug)
    .eq("hook_slug", hookSlug)
    .maybeSingle());
}

export function consumeShareableDancePrefetch() {
  const p = shareableDancePrefetch;
  shareableDancePrefetch = null;
  return p;
}

export function consumeShareableHookPrefetch() {
  const p = shareableHookPrefetch;
  shareableHookPrefetch = null;
  return p;
}

/** True when the current page is a lightweight embed/shareable route. */
export const isEmbedRoute = _isEmbedRoute;
