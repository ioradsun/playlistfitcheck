import { supabase } from "@/integrations/supabase/client";
import { SongFitTabImport } from "./routePrefetch";

/**
 * Prefetch cache — fires immediately at module evaluation time.
 * Consumed once by the corresponding component, then cleared.
 */

// Auth session — consumed by AuthProvider
export let authPrefetch: ReturnType<typeof supabase.auth.getSession> | null =
  supabase.auth.getSession();

export function consumeAuthPrefetch() {
  const p = authPrefetch;
  authPrefetch = null; // one-shot — subsequent calls go through normal path
  return p;
}

// Feed posts — consumed by SongFitFeed on first mount
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
  ).then((result) => result);

export function consumeFeedPrefetch() {
  const p = feedPrefetch;
  feedPrefetch = null; // one-shot
  return p;
}

// Site copy — consumed by SiteCopyProvider
export let siteCopyPrefetch: Promise<{ data: any; error: any }> | null =
  Promise.resolve(
    supabase
      .from("site_copy")
      .select("copy_json")
      .limit(1)
      .single()
  ).then((result) => result);

export function consumeSiteCopyPrefetch() {
  const p = siteCopyPrefetch;
  siteCopyPrefetch = null; // one-shot
  return p;
}


// SongFitTab chunk — start downloading in parallel with data prefetches.
// The lazy() wrapper in Index.tsx will resolve immediately if this finishes first.
void SongFitTabImport();
