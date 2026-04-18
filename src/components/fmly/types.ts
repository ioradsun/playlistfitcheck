export interface FmlyPost {
  id: string;
  user_id: string;
  project_id: string | null;
  caption: string;
  created_at: string;
  status: 'draft' | 'live' | 'expired' | 'cooldown' | 'eligible';
  profiles?: {
    display_name: string | null;
    avatar_url: string | null;
    spotify_artist_id: string | null;
    wallet_address?: string | null;
    is_verified?: boolean;
  };
  lyric_projects?: {
    id: string;
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
    auto_palettes?: any;
    lines?: any;
    words?: any;
    physics_spec?: any;
    empowerment_promise?: any;
  };
  current_rank?: number;
  is_instrumental?: boolean;
  peak_rank?: number | null;
  fires_count?: number;
  comments_count?: number;
  saves_count?: number;
  impressions?: number;
  engagement_score?: number;
}

export interface FmlyComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  parent_comment_id: string | null;
  created_at: string;
  profiles?: { display_name: string | null; avatar_url: string | null };
  replies?: FmlyComment[];
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
