import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeCinematicDirection } from "@/engine/cinematicResolver";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import type { CareerStats, Momentum, ProfileRecord, ProfileSong, VoiceLine } from "@/components/profile/types";

interface ProfileDataState {
  loading: boolean;
  notFound: boolean;
  profile: ProfileRecord | null;
  songs: ProfileSong[];
  voiceLines: VoiceLine[];
  momentum: Momentum;
  career: CareerStats;
  featuredLyricData: LyricDanceData | null;
}

const EMPTY_MOMENTUM: Momentum = {
  latestDropAt: null,
  latestDropTitle: null,
  firesThisWeek: 0,
  lockedInCount: 0,
};

const EMPTY_CAREER: CareerStats = {
  songs: 0,
  fires: 0,
  avgFires: 0,
  tenureDays: 0,
};

const SONG_SELECT =
  "id,user_id,caption,status,created_at,fires_count,comments_count," +
  "lyric_projects(id,title,artist_slug,url_slug,album_art_url,section_images,palette)";

export function useProfileData(viewedUserId: string | null) {
  const [state, setState] = useState<ProfileDataState>({
    loading: true,
    notFound: false,
    profile: null,
    songs: [],
    voiceLines: [],
    momentum: EMPTY_MOMENTUM,
    career: EMPTY_CAREER,
    featuredLyricData: null,
  });

  useEffect(() => {
    let canceled = false;

    async function load() {
      if (!viewedUserId) {
        setState((prev) => ({ ...prev, loading: false, notFound: false }));
        return;
      }

      setState((prev) => ({ ...prev, loading: true, notFound: false }));

      const [profileRes, songsRes, lockCountRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id,display_name,bio,avatar_url,spotify_embed_url,spotify_artist_id,instagram_url,tiktok_url,youtube_url,website_url,merch_url,is_verified,created_at",
          )
          .eq("id", viewedUserId)
          .maybeSingle(),
        supabase.from("feed_posts" as any).select(SONG_SELECT).eq("user_id", viewedUserId).order("created_at", { ascending: false }).limit(100),
        supabase
          .from("release_subscriptions")
          .select("subscriber_user_id", { count: "exact", head: true })
          .eq("artist_user_id", viewedUserId),
      ]);

      if (canceled) return;
      if (profileRes.error) {
        setState((prev) => ({ ...prev, loading: false, notFound: true }));
        return;
      }
      if (!profileRes.data) {
        setState((prev) => ({ ...prev, loading: false, notFound: true }));
        return;
      }

      const allSongs = ((songsRes.data ?? []) as ProfileSong[]).map((song) => ({
        ...song,
        fires_count: song.fires_count ?? 0,
        comments_count: song.comments_count ?? 0,
      }));

      const postIds = allSongs.map((song) => song.id);
      const liveSongs = allSongs.filter((song) => song.status === "live");
      const featuredLiveSong = liveSongs.length
        ? [...liveSongs].sort((a, b) => (b.fires_count ?? 0) - (a.fires_count ?? 0))[0]
        : null;
      const featuredProjectId = featuredLiveSong?.lyric_projects?.id ?? null;
      const featuredLyricPromise = featuredProjectId
        ? supabase
            .from("lyric_projects" as any)
            .select(LYRIC_DANCE_COLUMNS)
            .eq("id", featuredProjectId)
            .maybeSingle()
        : Promise.resolve({ data: null as LyricDanceData | null });
      const [likesRes, commentsRes] = postIds.length
        ? await Promise.all([
            supabase
              .from("feed_likes")
              .select("id,user_id,post_id,created_at,profiles:user_id(display_name)")
              .in("post_id", postIds)
              .order("created_at", { ascending: false })
              .limit(30),
            supabase
              .from("feed_comments" as any)
              .select("id,user_id,post_id,content,created_at,profiles:user_id(display_name)")
              .in("post_id", postIds)
              .order("created_at", { ascending: false })
              .limit(30),
          ])
        : [{ data: [] as any[] }, { data: [] as any[] }];

      const songMap = new Map(allSongs.map((song) => [song.id, song]));
      const voiceLines: VoiceLine[] = [];

      for (const row of likesRes.data ?? []) {
        if (!row.post_id || !row.user_id || row.user_id === viewedUserId) continue;
        const actorName = (row as any)?.profiles?.display_name?.trim();
        if (!actorName) continue;
        voiceLines.push({
          id: row.id,
          kind: "fire",
          actorName,
          postId: row.post_id,
          songTitle: songMap.get(row.post_id)?.lyric_projects?.title ?? songMap.get(row.post_id)?.caption ?? "Untitled",
          createdAt: row.created_at,
        });
      }

      for (const row of commentsRes.data ?? []) {
        if (!row.post_id || !row.user_id || row.user_id === viewedUserId) continue;
        const actorName = (row as any)?.profiles?.display_name?.trim();
        if (!actorName) continue;
        voiceLines.push({
          id: row.id,
          kind: "comment",
          actorName,
          postId: row.post_id,
          songTitle: songMap.get(row.post_id)?.lyric_projects?.title ?? songMap.get(row.post_id)?.caption ?? "Untitled",
          content: row.content ?? "",
          createdAt: row.created_at,
        });
      }

      voiceLines.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

      const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const firesThisWeekRes = postIds.length
        ? await supabase.from("feed_likes").select("id", { count: "exact", head: true }).in("post_id", postIds).gte("created_at", weekAgoIso)
        : { count: 0 };
      const firesThisWeek = firesThisWeekRes.count ?? 0;

      const now = Date.now();
      const latestLive = allSongs.find((song) => song.status === "live") ?? null;
      const featuredLyricRes = await featuredLyricPromise;

      const totalFires = allSongs.reduce((acc, song) => acc + (song.fires_count ?? 0), 0);
      const songsCount = allSongs.length;
      const createdAt = profileRes.data.created_at ? +new Date(profileRes.data.created_at) : now;
      const tenureDays = Math.max(1, Math.floor((now - createdAt) / (24 * 60 * 60 * 1000)));

      setState({
        loading: false,
        notFound: false,
        profile: profileRes.data as ProfileRecord,
        songs: allSongs,
        voiceLines: voiceLines.slice(0, 6),
        momentum: {
          latestDropAt: latestLive?.created_at ?? null,
          latestDropTitle: latestLive?.lyric_projects?.title ?? latestLive?.caption ?? null,
          firesThisWeek,
          lockedInCount: lockCountRes.count ?? 0,
        },
        career: {
          songs: songsCount,
          fires: totalFires,
          avgFires: songsCount ? Math.round((totalFires / songsCount) * 10) / 10 : 0,
          tenureDays,
        },
        featuredLyricData: featuredLyricRes.data
          ? ({
              ...(featuredLyricRes.data as LyricDanceData),
              cinematic_direction: (featuredLyricRes.data as LyricDanceData).cinematic_direction
                ? normalizeCinematicDirection((featuredLyricRes.data as LyricDanceData).cinematic_direction)
                : (featuredLyricRes.data as LyricDanceData).cinematic_direction,
            } as LyricDanceData)
          : null,
      });
    }

    void load();

    return () => {
      canceled = true;
    };
  }, [viewedUserId]);

  const featuredSong = useMemo(() => {
    const live = state.songs.filter((song) => song.status === "live");
    if (!live.length) return null;
    return [...live].sort((a, b) => (b.fires_count ?? 0) - (a.fires_count ?? 0))[0];
  }, [state.songs]);

  const heroTint = useMemo(() => {
    const raw = featuredSong?.lyric_projects?.palette?.[0];
    if (!raw) return "hsl(var(--primary))";
    return raw;
  }, [featuredSong]);

  return { ...state, featuredSong, heroTint };
}
