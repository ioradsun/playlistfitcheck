import { supabase } from "@/integrations/supabase/client";

/**
 * Log an engagement event (unique per user per event type per post).
 * Silently ignores duplicates via ON CONFLICT.
 */
export async function logEngagementEvent(
  postId: string,
  userId: string,
  eventType: 'like' | 'comment' | 'save' | 'spotify_click' | 'share' | 'follow_from_post' | 'profile_visit'
) {
  try {
    await supabase.from("songfit_engagement_events" as any).insert({
      post_id: postId,
      user_id: userId,
      event_type: eventType,
    });
  } catch {
    // Ignore duplicate constraint errors
  }
}

/**
 * Increment impression count for a post.
 */
export async function logImpression(postId: string) {
  try {
    await supabase.rpc("increment_impressions" as any, { _post_id: postId });
  } catch {
    // Best-effort
  }
}

/**
 * Check if a user already has an active or cooldown submission for a given track.
 * Returns the conflicting post if found.
 */
export async function checkDuplicateSubmission(
  userId: string,
  spotifyTrackId: string
): Promise<{ status: string; post: any } | null> {
  const { data } = await supabase
    .from("songfit_posts")
    .select("id, status, expires_at, cooldown_until, engagement_score, peak_rank")
    .eq("user_id", userId)
    .eq("spotify_track_id", spotifyTrackId)
    .in("status", ["live", "cooldown"])
    .limit(1)
    .maybeSingle();

  if (data) {
    return { status: data.status, post: data };
  }
  return null;
}

/**
 * Check if there's an eligible post for re-entry.
 */
export async function checkEligibleForReentry(
  userId: string,
  spotifyTrackId: string
): Promise<any | null> {
  const { data } = await supabase
    .from("songfit_posts")
    .select("id, cycle_number, engagement_score")
    .eq("user_id", userId)
    .eq("spotify_track_id", spotifyTrackId)
    .eq("status", "eligible")
    .limit(1)
    .maybeSingle();

  return data;
}

/**
 * Re-enter a submission (bump cycle, reset scores, apply legacy boost).
 */
export async function reenterSubmission(postId: string, previousScore: number) {
  const legacyBoost = previousScore * 0.15;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);

  const { error } = await supabase
    .from("songfit_posts")
    .update({
      status: "live",
      submitted_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      cooldown_until: null,
      engagement_score: 0,
      legacy_boost: legacyBoost,
      impressions: 0,
    } as any)
    .eq("id", postId);

  // Increment cycle_number separately since we can't do arithmetic in update
  if (!error) {
    await supabase.rpc("increment_cycle_number" as any, { _post_id: postId });
  }

  return { error };
}
