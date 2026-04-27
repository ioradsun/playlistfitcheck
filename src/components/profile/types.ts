export interface ProfileRecord {
  id: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  spotify_embed_url: string | null;
  spotify_artist_id: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  website_url: string | null;
  merch_url: string | null;
  is_verified: boolean;
  created_at: string | null;
}

export interface ProfileSong {
  id: string;
  user_id: string;
  caption: string | null;
  status: "draft" | "live" | "expired" | "cooldown" | "eligible";
  created_at: string;
  fires_count: number;
  comments_count: number;
  lyric_projects: {
    id: string;
    title: string | null;
    artist_slug: string | null;
    url_slug: string | null;
    album_art_url: string | null;
    section_images: string[] | null;
    palette: string[] | null;
  } | null;
}

export interface VoiceLine {
  id: string;
  kind: "fire" | "comment";
  actorName: string;
  postId: string;
  songTitle: string;
  content?: string;
  createdAt: string;
}

export interface Momentum {
  latestDropAt: string | null;
  latestDropTitle: string | null;
  firesThisWeek: number;
  lockedInCount: number;
}

export interface CareerStats {
  songs: number;
  fires: number;
  avgFires: number;
  tenureDays: number;
}

export interface PersonChip {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  value?: number;
  created_at?: string;
}
