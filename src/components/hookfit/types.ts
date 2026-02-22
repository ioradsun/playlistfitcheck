export interface HookFitPost {
  id: string;
  user_id: string;
  battle_id: string;
  hook_id: string;
  caption: string | null;
  created_at: string;
  status: string;
  // Joined from profiles
  profiles?: {
    display_name: string | null;
    avatar_url: string | null;
    is_verified?: boolean;
  };
  // Joined from shareable_hooks (primary hook)
  hook?: {
    artist_slug: string;
    song_slug: string;
    hook_slug: string;
    artist_name: string;
    song_name: string;
    hook_phrase: string;
    vote_count: number;
    hook_label: string | null;
  };
  // Aggregated vote count across battle
  total_votes?: number;
}

export type HookFitFeedView = "recent" | "top";
