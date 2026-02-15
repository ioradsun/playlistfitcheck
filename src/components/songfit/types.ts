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
  // joined
  profiles?: { display_name: string | null; avatar_url: string | null; spotify_artist_id: string | null };
  user_has_liked?: boolean;
  user_has_saved?: boolean;
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
