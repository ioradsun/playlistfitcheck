export interface SongFitPost {
  id: string;
  user_id: string;
  project_id: string | null;
  caption: string;
  tags_json: string[];
  fires_count: number;
  saves_count: number;
  comments_count: number;
  impressions: number;
  created_at: string;
  status: 'draft' | 'live' | 'expired' | 'cooldown' | 'eligible';
  submitted_at: string;
  expires_at: string | null;
  cooldown_until: string | null;
  cycle_number: number;
  engagement_score: number;
  peak_rank: number | null;
  legacy_boost: number;
  profiles?: { display_name: string | null; avatar_url: string | null; spotify_artist_id: string | null; wallet_address?: string | null; is_verified?: boolean };
  lyric_projects?: {
    title: string;
    artist_name: string | null;
    artist_slug: string | null;
    url_slug: string | null;
    audio_url: string | null;
    album_art_url: string | null;
    spotify_track_id: string | null;
    palette: string[] | null;
    cinematic_direction: any;
    beat_grid: any;
    section_images: string[] | null;
  };
  user_has_liked?: boolean;
  user_has_saved?: boolean;
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

export type BillboardMode = 'this_week' | 'last_week' | 'all_time';
export type FeedView = 'all' | 'now_streaming' | 'in_studio' | 'billboard';
export type ContentFilter = "all" | "lyrics" | "beats";
