export interface SongFitPost {
  id: string;
  user_id: string;
  spotify_track_url: string;
  spotify_track_id: string;
  track_title: string;
  track_artists_json: { name: string; id: string; spotifyUrl: string }[];
  album_title: string | null;
  album_art_url: string | null;
  release_date: string | null;
  preview_url: string | null;
  caption: string;
  tags_json: string[];
  likes_count: number;
  comments_count: number;
  tips_total: number;
  created_at: string;
  // Submission lifecycle
  status: 'draft' | 'live' | 'expired' | 'cooldown' | 'eligible';
  submitted_at: string;
  expires_at: string | null;
  cooldown_until: string | null;
  cycle_number: number;
  engagement_score: number;
  peak_rank: number | null;
  impressions: number;
  legacy_boost: number;
  // joined
  profiles?: { display_name: string | null; avatar_url: string | null; spotify_artist_id: string | null; wallet_address?: string | null; is_verified?: boolean };
  user_has_liked?: boolean;
  user_has_saved?: boolean;
  // computed at query time for billboard
  billboard_score?: number;
  current_rank?: number;
}

export interface SongFitComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  parent_comment_id: string | null;
  created_at: string;
  profiles?: { display_name: string | null; avatar_url: string | null };
  replies?: SongFitComment[];
}

export interface CycleHistory {
  id: string;
  post_id: string;
  cycle_number: number;
  final_engagement_score: number;
  peak_rank: number | null;
  started_at: string;
  ended_at: string;
}

export type BillboardMode = 'trending' | 'top' | 'best_fit' | 'all_time';
export type FeedView = 'recent' | 'billboard';
