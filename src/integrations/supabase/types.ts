export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_prompts: {
        Row: {
          label: string
          prompt: string
          slug: string
          updated_at: string
        }
        Insert: {
          label: string
          prompt: string
          slug: string
          updated_at?: string
        }
        Update: {
          label?: string
          prompt?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      artist_pages: {
        Row: {
          accent_color: string
          created_at: string
          featured_track_art: string | null
          featured_track_id: string | null
          featured_track_title: string | null
          featured_track_url: string | null
          hero_content_type: string | null
          hero_content_url: string | null
          id: string
          instagram_url: string | null
          merch_url: string | null
          sonic_identity: string | null
          theme: string
          tiktok_url: string | null
          updated_at: string
          user_id: string
          website_url: string | null
          youtube_url: string | null
        }
        Insert: {
          accent_color?: string
          created_at?: string
          featured_track_art?: string | null
          featured_track_id?: string | null
          featured_track_title?: string | null
          featured_track_url?: string | null
          hero_content_type?: string | null
          hero_content_url?: string | null
          id?: string
          instagram_url?: string | null
          merch_url?: string | null
          sonic_identity?: string | null
          theme?: string
          tiktok_url?: string | null
          updated_at?: string
          user_id: string
          website_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          accent_color?: string
          created_at?: string
          featured_track_art?: string | null
          featured_track_id?: string | null
          featured_track_title?: string | null
          featured_track_url?: string | null
          hero_content_type?: string | null
          hero_content_url?: string | null
          id?: string
          instagram_url?: string | null
          merch_url?: string | null
          sonic_identity?: string | null
          theme?: string
          tiktok_url?: string | null
          updated_at?: string
          user_id?: string
          website_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      battle_passes: {
        Row: {
          battle_id: string
          created_at: string
          id: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          battle_id: string
          created_at?: string
          id?: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          battle_id?: string
          created_at?: string
          id?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      collab_points: {
        Row: {
          badge: string | null
          id: string
          points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          badge?: string | null
          id?: string
          points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          badge?: string | null
          id?: string
          points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collab_points_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dream_backers: {
        Row: {
          context_note: string | null
          created_at: string
          dream_id: string
          id: string
          session_id: string | null
          signal_type: string
          user_id: string | null
        }
        Insert: {
          context_note?: string | null
          created_at?: string
          dream_id: string
          id?: string
          session_id?: string | null
          signal_type?: string
          user_id?: string | null
        }
        Update: {
          context_note?: string | null
          created_at?: string
          dream_id?: string
          id?: string
          session_id?: string | null
          signal_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dream_backers_dream_id_fkey"
            columns: ["dream_id"]
            isOneToOne: false
            referencedRelation: "dream_tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dream_backers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dream_comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dream_comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "dream_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      dream_comments: {
        Row: {
          content: string
          created_at: string
          dream_id: string
          id: string
          likes_count: number
          parent_comment_id: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          dream_id: string
          id?: string
          likes_count?: number
          parent_comment_id?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          dream_id?: string
          id?: string
          likes_count?: number
          parent_comment_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dream_comments_dream_id_fkey"
            columns: ["dream_id"]
            isOneToOne: false
            referencedRelation: "dream_tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dream_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "dream_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dream_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dream_tools: {
        Row: {
          backers_count: number
          comments_count: number
          created_at: string
          dream_type: string
          frustration: string
          greenlight_count: number
          id: string
          status: string
          status_note: string | null
          target_fit: string | null
          title: string
          transformation: string
          trending_score: number
          user_id: string
        }
        Insert: {
          backers_count?: number
          comments_count?: number
          created_at?: string
          dream_type?: string
          frustration: string
          greenlight_count?: number
          id?: string
          status?: string
          status_note?: string | null
          target_fit?: string | null
          title: string
          transformation: string
          trending_score?: number
          user_id: string
        }
        Update: {
          backers_count?: number
          comments_count?: number
          created_at?: string
          dream_type?: string
          frustration?: string
          greenlight_count?: number
          id?: string
          status?: string
          status_note?: string | null
          target_fit?: string | null
          title?: string
          transformation?: string
          trending_score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dream_tools_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_weights: {
        Row: {
          event_type: string
          weight: number
        }
        Insert: {
          event_type: string
          weight?: number
        }
        Update: {
          event_type?: string
          weight?: number
        }
        Relationships: []
      }
      hook_comments: {
        Row: {
          hook_id: string
          id: string
          session_id: string | null
          submitted_at: string
          text: string
          user_id: string | null
        }
        Insert: {
          hook_id: string
          id?: string
          session_id?: string | null
          submitted_at?: string
          text: string
          user_id?: string | null
        }
        Update: {
          hook_id?: string
          id?: string
          session_id?: string | null
          submitted_at?: string
          text?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hook_comments_hook_id_fkey"
            columns: ["hook_id"]
            isOneToOne: false
            referencedRelation: "shareable_hooks"
            referencedColumns: ["id"]
          },
        ]
      }
      hook_votes: {
        Row: {
          battle_id: string
          created_at: string
          hook_id: string
          id: string
          playback_order: string | null
          played_first_hook_id: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          battle_id: string
          created_at?: string
          hook_id: string
          id?: string
          playback_order?: string | null
          played_first_hook_id?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          battle_id?: string
          created_at?: string
          hook_id?: string
          id?: string
          playback_order?: string | null
          played_first_hook_id?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hook_votes_hook_id_fkey"
            columns: ["hook_id"]
            isOneToOne: false
            referencedRelation: "shareable_hooks"
            referencedColumns: ["id"]
          },
        ]
      }
      hookfit_posts: {
        Row: {
          battle_id: string
          caption: string | null
          created_at: string
          hook_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          battle_id: string
          caption?: string | null
          created_at?: string
          hook_id: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          battle_id?: string
          caption?: string | null
          created_at?: string
          hook_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hookfit_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          converted_at: string | null
          created_at: string
          id: string
          invite_code: string
          invitee_user_id: string | null
          inviter_user_id: string
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          id?: string
          invite_code: string
          invitee_user_id?: string | null
          inviter_user_id: string
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          id?: string
          invite_code?: string
          invitee_user_id?: string | null
          inviter_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_invitee_user_id_fkey"
            columns: ["invitee_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mix_projects: {
        Row: {
          created_at: string
          id: string
          mixes: Json | null
          notes: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mixes?: Json | null
          notes?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mixes?: Json | null
          notes?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_user_id: string
          comment_id: string | null
          created_at: string
          id: string
          is_read: boolean
          post_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_user_id: string
          comment_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          post_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_user_id?: string
          comment_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          post_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "songfit_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "songfit_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_snapshots: {
        Row: {
          created_at: string
          description: string | null
          followers_total: number | null
          id: string
          owner_name: string | null
          playlist_id: string
          playlist_name: string | null
          playlist_url: string
          track_ids: string[]
          track_positions: Json | null
          tracks_total: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          followers_total?: number | null
          id?: string
          owner_name?: string | null
          playlist_id: string
          playlist_name?: string | null
          playlist_url: string
          track_ids?: string[]
          track_positions?: Json | null
          tracks_total?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          followers_total?: number | null
          id?: string
          owner_name?: string | null
          playlist_id?: string
          playlist_name?: string | null
          playlist_url?: string
          track_ids?: string[]
          track_positions?: Json | null
          tracks_total?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          artist_fingerprint: Json | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          instagram_url: string | null
          invite_code: string | null
          is_unlimited: boolean
          is_verified: boolean
          spotify_artist_id: string | null
          spotify_embed_url: string | null
          theme: string
          trailblazer_number: number | null
          wallet_address: string | null
          website_url: string | null
          youtube_url: string | null
        }
        Insert: {
          artist_fingerprint?: Json | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          instagram_url?: string | null
          invite_code?: string | null
          is_unlimited?: boolean
          is_verified?: boolean
          spotify_artist_id?: string | null
          spotify_embed_url?: string | null
          theme?: string
          trailblazer_number?: number | null
          wallet_address?: string | null
          website_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          artist_fingerprint?: Json | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          instagram_url?: string | null
          invite_code?: string | null
          is_unlimited?: boolean
          is_verified?: boolean
          spotify_artist_id?: string | null
          spotify_embed_url?: string | null
          theme?: string
          trailblazer_number?: number | null
          wallet_address?: string | null
          website_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      profit_artists: {
        Row: {
          artist_url: string | null
          created_at: string
          followers_total: number | null
          genres_json: Json | null
          id: string
          image_url: string | null
          last_synced_at: string | null
          name: string
          popularity: number | null
          raw_artist_json: Json | null
          signals_json: Json | null
          spotify_artist_id: string
          top_tracks_json: Json | null
          updated_at: string
        }
        Insert: {
          artist_url?: string | null
          created_at?: string
          followers_total?: number | null
          genres_json?: Json | null
          id?: string
          image_url?: string | null
          last_synced_at?: string | null
          name: string
          popularity?: number | null
          raw_artist_json?: Json | null
          signals_json?: Json | null
          spotify_artist_id: string
          top_tracks_json?: Json | null
          updated_at?: string
        }
        Update: {
          artist_url?: string | null
          created_at?: string
          followers_total?: number | null
          genres_json?: Json | null
          id?: string
          image_url?: string | null
          last_synced_at?: string | null
          name?: string
          popularity?: number | null
          raw_artist_json?: Json | null
          signals_json?: Json | null
          spotify_artist_id?: string
          top_tracks_json?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      profit_chats: {
        Row: {
          created_at: string
          id: string
          messages_json: Json
          report_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages_json?: Json
          report_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          messages_json?: Json
          report_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_chats_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "profit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_plan_variants: {
        Row: {
          created_at: string
          id: string
          plan_json: Json
          report_id: string
          variant_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_json: Json
          report_id: string
          variant_type: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_json?: Json
          report_id?: string
          variant_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_plan_variants_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "profit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_reports: {
        Row: {
          artist_id: string
          blueprint_json: Json
          created_at: string
          id: string
          model_info: string | null
          share_token: string | null
          signals_json: Json | null
        }
        Insert: {
          artist_id: string
          blueprint_json: Json
          created_at?: string
          id?: string
          model_info?: string | null
          share_token?: string | null
          signals_json?: Json | null
        }
        Update: {
          artist_id?: string
          blueprint_json?: Json
          created_at?: string
          id?: string
          model_info?: string | null
          share_token?: string | null
          signals_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "profit_reports_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "profit_artists"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_hitfit: {
        Row: {
          analysis_json: Json
          created_at: string
          filename: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_json: Json
          created_at?: string
          filename?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_json?: Json
          created_at?: string
          filename?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_hitfit_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_lyrics: {
        Row: {
          artist: string
          audio_url: string | null
          beat_grid: Json | null
          created_at: string
          filename: string | null
          fmly_lines: Json | null
          id: string
          lines: Json
          song_dna: Json | null
          title: string
          updated_at: string
          user_id: string
          version_meta: Json | null
        }
        Insert: {
          artist?: string
          audio_url?: string | null
          beat_grid?: Json | null
          created_at?: string
          filename?: string | null
          fmly_lines?: Json | null
          id?: string
          lines?: Json
          song_dna?: Json | null
          title?: string
          updated_at?: string
          user_id: string
          version_meta?: Json | null
        }
        Update: {
          artist?: string
          audio_url?: string | null
          beat_grid?: Json | null
          created_at?: string
          filename?: string | null
          fmly_lines?: Json | null
          id?: string
          lines?: Json
          song_dna?: Json | null
          title?: string
          updated_at?: string
          user_id?: string
          version_meta?: Json | null
        }
        Relationships: []
      }
      saved_searches: {
        Row: {
          blended_label: string | null
          blended_score: number | null
          created_at: string
          health_label: string | null
          health_score: number | null
          id: string
          playlist_name: string | null
          playlist_url: string | null
          report_data: Json | null
          song_name: string | null
          song_url: string | null
          user_id: string
        }
        Insert: {
          blended_label?: string | null
          blended_score?: number | null
          created_at?: string
          health_label?: string | null
          health_score?: number | null
          id?: string
          playlist_name?: string | null
          playlist_url?: string | null
          report_data?: Json | null
          song_name?: string | null
          song_url?: string | null
          user_id: string
        }
        Update: {
          blended_label?: string | null
          blended_score?: number | null
          created_at?: string
          health_label?: string | null
          health_score?: number | null
          id?: string
          playlist_name?: string | null
          playlist_url?: string | null
          report_data?: Json | null
          song_name?: string | null
          song_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      saved_vibefit: {
        Row: {
          created_at: string
          genre: string
          id: string
          moods: string[]
          result_json: Json
          song_title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          genre?: string
          id?: string
          moods?: string[]
          result_json: Json
          song_title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          genre?: string
          id?: string
          moods?: string[]
          result_json?: Json
          song_title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_vibefit_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_logs: {
        Row: {
          created_at: string
          id: string
          playlist_name: string | null
          playlist_url: string | null
          session_id: string | null
          song_name: string | null
          song_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          playlist_name?: string | null
          playlist_url?: string | null
          session_id?: string | null
          song_name?: string | null
          song_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          playlist_name?: string | null
          playlist_url?: string | null
          session_id?: string | null
          song_name?: string | null
          song_url?: string | null
        }
        Relationships: []
      }
      shareable_hooks: {
        Row: {
          artist_dna: Json | null
          artist_name: string
          artist_slug: string
          audio_url: string
          battle_id: string | null
          battle_position: number | null
          beat_grid: Json
          created_at: string
          fire_count: number
          hook_end: number
          hook_label: string | null
          hook_phrase: string
          hook_slug: string
          hook_start: number
          id: string
          lyrics: Json
          palette: Json
          physics_spec: Json
          signature_line: string | null
          song_name: string
          song_slug: string
          system_type: string
          updated_at: string
          user_id: string
          vote_count: number
        }
        Insert: {
          artist_dna?: Json | null
          artist_name: string
          artist_slug: string
          audio_url: string
          battle_id?: string | null
          battle_position?: number | null
          beat_grid: Json
          created_at?: string
          fire_count?: number
          hook_end: number
          hook_label?: string | null
          hook_phrase: string
          hook_slug: string
          hook_start: number
          id?: string
          lyrics: Json
          palette?: Json
          physics_spec: Json
          signature_line?: string | null
          song_name: string
          song_slug: string
          system_type?: string
          updated_at?: string
          user_id: string
          vote_count?: number
        }
        Update: {
          artist_dna?: Json | null
          artist_name?: string
          artist_slug?: string
          audio_url?: string
          battle_id?: string | null
          battle_position?: number | null
          beat_grid?: Json
          created_at?: string
          fire_count?: number
          hook_end?: number
          hook_label?: string | null
          hook_phrase?: string
          hook_slug?: string
          hook_start?: number
          id?: string
          lyrics?: Json
          palette?: Json
          physics_spec?: Json
          signature_line?: string | null
          song_name?: string
          song_slug?: string
          system_type?: string
          updated_at?: string
          user_id?: string
          vote_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "shareable_hooks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shareable_lyric_dances: {
        Row: {
          artist_dna: Json | null
          artist_name: string
          artist_slug: string
          audio_url: string
          beat_grid: Json
          created_at: string
          id: string
          lyrics: Json
          palette: Json
          physics_spec: Json
          seed: string
          song_name: string
          song_slug: string
          system_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          artist_dna?: Json | null
          artist_name: string
          artist_slug: string
          audio_url: string
          beat_grid: Json
          created_at?: string
          id?: string
          lyrics: Json
          palette?: Json
          physics_spec: Json
          seed?: string
          song_name: string
          song_slug: string
          system_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          artist_dna?: Json | null
          artist_name?: string
          artist_slug?: string
          audio_url?: string
          beat_grid?: Json
          created_at?: string
          id?: string
          lyrics?: Json
          palette?: Json
          physics_spec?: Json
          seed?: string
          song_name?: string
          song_slug?: string
          system_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shareable_lyric_dances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_copy: {
        Row: {
          copy_json: Json
          id: string
          updated_at: string
        }
        Insert: {
          copy_json?: Json
          id?: string
          updated_at?: string
        }
        Update: {
          copy_json?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      songfit_blocks: {
        Row: {
          blocked_user_id: string
          blocker_user_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_user_id: string
          blocker_user_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_user_id?: string
          blocker_user_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      songfit_comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "songfit_comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "songfit_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      songfit_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          likes_count: number
          parent_comment_id: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          likes_count?: number
          parent_comment_id?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          likes_count?: number
          parent_comment_id?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "songfit_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "songfit_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "songfit_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "songfit_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "songfit_comments_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      songfit_cycle_history: {
        Row: {
          cycle_number: number
          ended_at: string
          final_engagement_score: number
          id: string
          peak_rank: number | null
          post_id: string
          started_at: string
        }
        Insert: {
          cycle_number: number
          ended_at: string
          final_engagement_score?: number
          id?: string
          peak_rank?: number | null
          post_id: string
          started_at: string
        }
        Update: {
          cycle_number?: number
          ended_at?: string
          final_engagement_score?: number
          id?: string
          peak_rank?: number | null
          post_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "songfit_cycle_history_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "songfit_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      songfit_engagement_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "songfit_engagement_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "songfit_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      songfit_follows: {
        Row: {
          created_at: string
          followed_user_id: string
          follower_user_id: string
          id: string
        }
        Insert: {
          created_at?: string
          followed_user_id: string
          follower_user_id: string
          id?: string
        }
        Update: {
          created_at?: string
          followed_user_id?: string
          follower_user_id?: string
          id?: string
        }
        Relationships: []
      }
      songfit_hook_reviews: {
        Row: {
          context_note: string | null
          created_at: string
          hook_rating: string
          id: string
          post_id: string
          session_id: string | null
          user_id: string | null
          would_replay: boolean
        }
        Insert: {
          context_note?: string | null
          created_at?: string
          hook_rating: string
          id?: string
          post_id: string
          session_id?: string | null
          user_id?: string | null
          would_replay: boolean
        }
        Update: {
          context_note?: string | null
          created_at?: string
          hook_rating?: string
          id?: string
          post_id?: string
          session_id?: string | null
          user_id?: string | null
          would_replay?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "songfit_hook_reviews_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "songfit_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      songfit_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "songfit_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "songfit_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "songfit_likes_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      songfit_posts: {
        Row: {
          album_art_url: string | null
          album_title: string | null
          caption: string | null
          comments_count: number
          cooldown_until: string | null
          created_at: string
          cycle_number: number
          engagement_score: number
          expires_at: string | null
          id: string
          impressions: number
          legacy_boost: number
          likes_count: number
          peak_rank: number | null
          preview_url: string | null
          release_date: string | null
          spotify_track_id: string
          spotify_track_url: string
          status: string
          submitted_at: string
          tags_json: Json
          tips_total: number
          track_artists_json: Json
          track_title: string
          user_id: string
        }
        Insert: {
          album_art_url?: string | null
          album_title?: string | null
          caption?: string | null
          comments_count?: number
          cooldown_until?: string | null
          created_at?: string
          cycle_number?: number
          engagement_score?: number
          expires_at?: string | null
          id?: string
          impressions?: number
          legacy_boost?: number
          likes_count?: number
          peak_rank?: number | null
          preview_url?: string | null
          release_date?: string | null
          spotify_track_id: string
          spotify_track_url: string
          status?: string
          submitted_at?: string
          tags_json?: Json
          tips_total?: number
          track_artists_json?: Json
          track_title: string
          user_id: string
        }
        Update: {
          album_art_url?: string | null
          album_title?: string | null
          caption?: string | null
          comments_count?: number
          cooldown_until?: string | null
          created_at?: string
          cycle_number?: number
          engagement_score?: number
          expires_at?: string | null
          id?: string
          impressions?: number
          legacy_boost?: number
          likes_count?: number
          peak_rank?: number | null
          preview_url?: string | null
          release_date?: string | null
          spotify_track_id?: string
          spotify_track_url?: string
          status?: string
          submitted_at?: string
          tags_json?: Json
          tips_total?: number
          track_artists_json?: Json
          track_title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "songfit_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      songfit_reports: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          post_id: string | null
          reason: string
          reporter_user_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          reason: string
          reporter_user_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          reason?: string
          reporter_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "songfit_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "songfit_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "songfit_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "songfit_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      songfit_saves: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "songfit_saves_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "songfit_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      songfit_tips: {
        Row: {
          amount: number
          created_at: string
          id: string
          post_id: string
          recipient_user_id: string
          tipper_user_id: string
          tx_hash: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          post_id: string
          recipient_user_id: string
          tipper_user_id: string
          tx_hash?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          post_id?: string
          recipient_user_id?: string
          tipper_user_id?: string
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "songfit_tips_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "songfit_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      track_engagement: {
        Row: {
          action: string
          artist_name: string | null
          created_at: string
          id: string
          session_id: string | null
          track_id: string
          track_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          artist_name?: string | null
          created_at?: string
          id?: string
          session_id?: string | null
          track_id: string
          track_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          artist_name?: string | null
          created_at?: string
          id?: string
          session_id?: string | null
          track_id?: string
          track_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      usage_tracking: {
        Row: {
          count: number
          id: string
          period: string
          session_id: string | null
          tool: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          count?: number
          id?: string
          period?: string
          session_id?: string | null
          tool: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          count?: number
          id?: string
          period?: string
          session_id?: string | null
          tool?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_tracking_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verification_requests: {
        Row: {
          created_at: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          screenshot_url: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_url: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_url?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_config: {
        Row: {
          embed_url: string
          id: string
          mode: string
          playlist_url: string
          thumbnail_link: string | null
          thumbnail_url: string | null
          updated_at: string
          widget_title: string
        }
        Insert: {
          embed_url?: string
          id?: string
          mode?: string
          playlist_url?: string
          thumbnail_link?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          widget_title?: string
        }
        Update: {
          embed_url?: string
          id?: string
          mode?: string
          playlist_url?: string
          thumbnail_link?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          widget_title?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_cycle_number: { Args: { _post_id: string }; Returns: undefined }
      increment_impressions: { Args: { _post_id: string }; Returns: undefined }
      update_submission_statuses: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "artist" | "curator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["artist", "curator", "user"],
    },
  },
} as const
