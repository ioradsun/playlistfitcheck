import { supabase } from "@/integrations/supabase/client";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import { preloadImage } from "@/lib/imagePreloadCache";
import { cdnImage } from "@/lib/cdnImage";

/**
 * Prefetch cache — fires immediately at module evaluation time.
 * Consumed once by the corresponding component, then cleared.
 *
 * Embed routes (3-segment paths like /:artist/:song/lyric-dance) skip
 * feed, siteCopy, auth, and FmlyFeed prefetches entirely — those
 * pages never use them.
 */

// ── Route detection (runs once at module eval) ──────────────────────────────
const _path = typeof window !== "undefined" ? window.location.pathname : "";
const _segments = _path.replace(/^\//, "").split("/").filter(Boolean);
const _isEmbedRoute = _segments.length === 3;

// ── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_PREFIX = "tfm:";
const CACHE_TTL_MS = 5 * 60 * 1000;
const DANCE_CACHE_PREFIX = "dance:";
const DANCE_CACHE_TTL_MS = 10 * 60 * 1000;
const _preloadedAudio = new Set<string>();

function preloadAudio(url: string) {
  if (!url || _preloadedAudio.has(url)) return;
  _preloadedAudio.add(url);
  // Warm the HTTP cache — the engine's Audio element will hit it.
  // No orphan Audio element: fetch() is lighter and cache-equivalent.
  fetch(url, { priority: "high" } as RequestInit).catch(() => {});
}

/** Kick font loading from cinematic_direction — runs parallel with DB/audio/image prefetch. */
function _preloadFontsFromDirection(cd: unknown): void {
  if (!cd || typeof cd !== "object") return;
  import("@/lib/fontResolver").then(({ resolveTypographyFromDirection, getFontNamesForPreload }) => {
    import("@/lib/fontReadinessCache").then(({ ensureFontReady }) => {
      try {
        const typo = resolveTypographyFromDirection(cd);
        getFontNamesForPreload(typo).forEach((name) => ensureFontReady(name));
      } catch {}
    });
  }).catch(() => {});
}

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
let _didWarnLegacyLyricCache = false;

export function getCachedLyricText(): Record<string, any> | null {
  return cacheRead<Record<string, any>>("lyric_text");
}

export function getCachedLyricScene(): Record<string, any> | null {
  return cacheRead<Record<string, any>>("lyric_scene");
}

/** Legacy fallback (read-only). Use getCachedLyricText/getCachedLyricScene for new writes. */
export function getCachedLyricData(): Record<string, any> | null {
  const legacy = cacheRead<Record<string, any>>("lyric_data");
  if (legacy && !_didWarnLegacyLyricCache) {
    _didWarnLegacyLyricCache = true;
    console.warn("[prefetch] legacy lyric_data cache hit; migrate to lyric_text/lyric_scene.");
  }
  return legacy;
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

// ── Feed posts prefetch — consumed by FmlyFeed on first mount ─────────────

const FEED_PAGE_SIZE = 20;
const FEED_COLUMNS =
  "*, profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address, is_verified)," +
  "lyric_projects(id, title, artist_name, artist_slug, url_slug, audio_url, album_art_url, spotify_track_id," +
  "palette, cinematic_direction, beat_grid, section_images, auto_palettes, lines, words," +
  "physics_spec, empowerment_promise)";

export const FEED_SHELL_COLUMNS =
  "id, user_id, project_id, caption, created_at, status, " +
  "profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address, is_verified), " +
  "lyric_projects(id, title, artist_name, artist_slug, url_slug, album_art_url, section_images, palette, auto_palettes, spotify_track_id)";

export let feedShellPrefetch: Promise<{ data: any[] | null; error: any }> | null =
  _isEmbedRoute
    ? null
    : (supabase
        .from("feed_posts" as any)
        .select(FEED_SHELL_COLUMNS)
        .eq("status", "live")
        .limit(FEED_PAGE_SIZE)
        .order("created_at", { ascending: false }) as any);

export let feedFullPrefetch: Promise<{ data: any[] | null; error: any }> | null =
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

          // Warm primary post's audio HTTP cache immediately — saves 100-400ms
          // off time-to-first-play. The engine's <audio> element will hit the
          // browser cache instead of issuing a fresh request.
          const primaryAudio = (result.data as any[])[0]?.lyric_projects?.audio_url;
          if (primaryAudio) preloadAudio(primaryAudio);

          const lyricTextCache: Record<string, any> = getCachedLyricText() ?? {};
          const lyricSceneCache: Record<string, any> = getCachedLyricScene() ?? {};
          for (let pi = 0; pi < (result.data as any[]).length; pi++) {
            const post = (result.data as any[])[pi];
            const lp = post.lyric_projects;
            if (!lp?.id) continue;

            lyricTextCache[lp.id] = {
              id: lp.id,
              lines: lp.lines,
              words: lp.words,
              audio_url: lp.audio_url,
              title: lp.title,
              artist_name: lp.artist_name,
              album_art_url: lp.album_art_url,
              spotify_track_id: lp.spotify_track_id,
            };

            if (lp.cinematic_direction) {
              lyricSceneCache[lp.id] = {
                id: lp.id,
                cinematic_direction: lp.cinematic_direction,
                section_images: lp.section_images,
                palette: lp.palette,
                auto_palettes: lp.auto_palettes,
                beat_grid: lp.beat_grid,
                physics_spec: lp.physics_spec,
                empowerment_promise: lp.empowerment_promise,
              };
            }

            const sectionImages = lp.section_images ?? [];
            sectionImages.filter(Boolean).forEach((url: string, imgIdx: number) => {
              // Preload the same variant consumed by shell + identity frame.
              preloadImage(cdnImage(url, "live"), pi === 0 && imgIdx === 0 ? { priority: "high" } : undefined);
            });
            // Parallel font preload — font ready before engine init()
            _preloadFontsFromDirection(lp.cinematic_direction);

            if (lp.album_art_url) {
              const img = new Image();
              img.src = cdnImage(lp.album_art_url, "live");
            }
          }

          if (Object.keys(lyricTextCache).length > 0) cacheWrite("lyric_text", lyricTextCache);
          if (Object.keys(lyricSceneCache).length > 0) cacheWrite("lyric_scene", lyricSceneCache);

        }
        return result;
      });

export function consumeFeedShellPrefetch() {
  const p = feedShellPrefetch;
  feedShellPrefetch = null;
  return p;
}

export function consumeFeedFullPrefetch() {
  const p = feedFullPrefetch;
  feedFullPrefetch = null;
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
  import("./routePrefetch").then(({ FmlyFeedImport }) => void FmlyFeedImport());
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
        preloadAudio(result.data.audio_url);
      }
      const sectionImages = result.data.section_images ?? [];
      // Embed pages use a larger canvas — preload the engine variant so the
      // browser cache hit lines up with what loadSectionImages requests.
      sectionImages.filter(Boolean).forEach((url: string) => preloadImage(cdnImage(url, "engine")));
      // Parallel font preload — font ready before engine init()
      _preloadFontsFromDirection(result.data.cinematic_direction);
    }
    return result;
  });

  const dataPromise = cached
    ? Promise.resolve({ data: cached, error: null })
    : networkPromise;

  if (cached?.audio_url) {
    preloadAudio(cached.audio_url);
  }
  // Parallel font preload from cache — font ready before engine init()
  if (cached?.cinematic_direction) {
    _preloadFontsFromDirection(cached.cinematic_direction);
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
