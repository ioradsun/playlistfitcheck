import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ActivityEvent {
  id: string;
  kind: "fire" | "play" | "lyric_comment" | "post_comment" | "save" | "follow" | "message";
  direction: "incoming" | "outgoing";
  created_at: string;
  song_name?: string;
  line_index?: number;
  time_sec?: number;
  hold_ms?: number;
  fire_count?: number;
  max_progress_pct?: number;
  play_count?: number;
  duration_sec?: number;
  was_muted?: boolean;
  text?: string;
  sender_id?: string;
  is_read?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401 });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: authError,
    } = await createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    }).auth.getUser();

    if (authError || !user) return new Response("Unauthorized", { status: 401 });

    const { partner_user_id } = await req.json();
    if (!partner_user_id) return new Response("Missing partner_user_id", { status: 400 });

    const myId = user.id;
    const partnerId = partner_user_id;

    const [
      { data: firesOnMe },
      { data: myFires },
      { data: lyricCommentsOnMe },
      { data: myLyricComments },
      { data: postCommentsOnMe },
      { data: myPostComments },
      { data: playsOnMe },
      { data: myPlays },
      { data: savesOnMe },
      { data: follows },
    ] = await Promise.all([
      supabase
        .from("project_fires")
        .select(`
          id, line_index, time_sec, hold_ms, created_at,
          lyric_projects!inner(
            id, title, artist_name, user_id
          )
        `)
        .eq("user_id", partnerId)
        .eq("lyric_projects.user_id", myId)
        .order("created_at", { ascending: true })
        .limit(200),
      supabase
        .from("project_fires")
        .select(`
          id, line_index, time_sec, hold_ms, created_at,
          lyric_projects!inner(
            id, title, artist_name, user_id
          )
        `)
        .eq("user_id", myId)
        .eq("lyric_projects.user_id", partnerId)
        .order("created_at", { ascending: true })
        .limit(200),
      supabase
        .from("project_comments")
        .select(`
          id, text, line_index, submitted_at,
          lyric_projects!inner(id, title, user_id)
        `)
        .eq("user_id", partnerId)
        .eq("lyric_projects.user_id", myId)
        .is("parent_comment_id", null)
        .order("submitted_at", { ascending: true })
        .limit(200),
      supabase
        .from("project_comments")
        .select(`
          id, text, line_index, submitted_at,
          lyric_projects!inner(id, title, user_id)
        `)
        .eq("user_id", myId)
        .eq("lyric_projects.user_id", partnerId)
        .is("parent_comment_id", null)
        .order("submitted_at", { ascending: true })
        .limit(200),
      supabase
        .from("feed_comments")
        .select(`
          id, content, created_at,
          feed_posts!inner(id, project_id, user_id, lyric_projects(title))
        `)
        .eq("user_id", partnerId)
        .eq("feed_posts.user_id", myId)
        .order("created_at", { ascending: true })
        .limit(100),
      supabase
        .from("feed_comments")
        .select(`
          id, content, created_at,
          feed_posts!inner(id, project_id, user_id, lyric_projects(title))
        `)
        .eq("user_id", myId)
        .eq("feed_posts.user_id", partnerId)
        .order("created_at", { ascending: true })
        .limit(100),
      supabase
        .from("project_plays")
        .select(`
          session_id, was_muted, max_progress_pct, play_count,
          duration_sec, updated_at,
          lyric_projects!inner(id, title, user_id)
        `)
        .eq("user_id", partnerId)
        .eq("lyric_projects.user_id", myId)
        .order("updated_at", { ascending: true }),
      supabase
        .from("project_plays")
        .select(`
          session_id, was_muted, max_progress_pct, play_count,
          duration_sec, updated_at,
          lyric_projects!inner(id, title, user_id)
        `)
        .eq("user_id", myId)
        .eq("lyric_projects.user_id", partnerId)
        .order("updated_at", { ascending: true }),
      supabase
        .from("feed_saves")
        .select(`
          id, created_at,
          feed_posts!inner(id, project_id, user_id, lyric_projects(title))
        `)
        .eq("user_id", partnerId)
        .eq("feed_posts.user_id", myId)
        .order("created_at", { ascending: true })
        .limit(100),
      supabase
        .from("songfit_follows")
        .select("id, created_at, follower_user_id, followed_user_id")
        .or(`and(follower_user_id.eq.${myId},followed_user_id.eq.${partnerId}),and(follower_user_id.eq.${partnerId},followed_user_id.eq.${myId})`)
        .order("created_at", { ascending: true }),
    ]);

    const [ua, ub] = [myId, partnerId].sort();
    const { data: thread } = await supabase
      .from("dm_threads")
      .select("id")
      .eq("user_a_id", ua)
      .eq("user_b_id", ub)
      .maybeSingle();

    const { data: messages } = thread
      ? await supabase
          .from("dm_messages")
          .select("id, sender_id, content, created_at, is_read")
          .eq("thread_id", thread.id)
          .order("created_at", { ascending: true })
          .limit(500)
      : { data: [] };

    const events: ActivityEvent[] = [];

    const collapseFiresIntoGroups = (
      rows: any[],
      direction: "incoming" | "outgoing",
    ) => {
      const grouped = new Map<string, ActivityEvent>();
      for (const row of rows ?? []) {
        const dance = row.lyric_projects;
        const key = `${dance?.id}-${row.line_index}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.fire_count = (existing.fire_count ?? 1) + 1;
          if (row.created_at > existing.created_at) {
            existing.created_at = row.created_at;
          }
        } else {
          grouped.set(key, {
            id: row.id,
            kind: "fire",
            direction,
            created_at: row.created_at,
            song_name: dance?.title,
            line_index: row.line_index,
            time_sec: row.time_sec,
            hold_ms: row.hold_ms,
            fire_count: 1,
          });
        }
      }
      return Array.from(grouped.values());
    };

    events.push(...collapseFiresIntoGroups(firesOnMe ?? [], "incoming"));
    events.push(...collapseFiresIntoGroups(myFires ?? [], "outgoing"));

    for (const row of playsOnMe ?? []) {
      const dance = row.lyric_projects as any;
      events.push({
        id: `play-${row.session_id}`,
        kind: "play",
        direction: "incoming",
        created_at: row.updated_at,
        song_name: dance?.title,
        max_progress_pct: row.max_progress_pct,
        play_count: row.play_count,
        duration_sec: row.duration_sec,
        was_muted: row.was_muted,
      });
    }

    for (const row of myPlays ?? []) {
      const dance = row.lyric_projects as any;
      events.push({
        id: `play-${row.session_id}`,
        kind: "play",
        direction: "outgoing",
        created_at: row.updated_at,
        song_name: dance?.title,
        max_progress_pct: row.max_progress_pct,
        play_count: row.play_count,
        duration_sec: row.duration_sec,
        was_muted: row.was_muted,
      });
    }

    for (const row of lyricCommentsOnMe ?? []) {
      const dance = row.lyric_projects as any;
      events.push({
        id: row.id,
        kind: "lyric_comment",
        direction: "incoming",
        created_at: row.submitted_at,
        song_name: dance?.title,
        line_index: row.line_index,
        text: row.text,
      });
    }

    for (const row of myLyricComments ?? []) {
      const dance = row.lyric_projects as any;
      events.push({
        id: row.id,
        kind: "lyric_comment",
        direction: "outgoing",
        created_at: row.submitted_at,
        song_name: dance?.title,
        line_index: row.line_index,
        text: row.text,
      });
    }

    for (const row of postCommentsOnMe ?? []) {
      const post = row.feed_posts as any;
      events.push({
        id: row.id,
        kind: "post_comment",
        direction: "incoming",
        created_at: row.created_at,
        song_name: post?.lyric_projects?.title,
        text: row.content,
      });
    }

    for (const row of myPostComments ?? []) {
      const post = row.feed_posts as any;
      events.push({
        id: row.id,
        kind: "post_comment",
        direction: "outgoing",
        created_at: row.created_at,
        song_name: post?.lyric_projects?.title,
        text: row.content,
      });
    }

    for (const row of savesOnMe ?? []) {
      const post = row.feed_posts as any;
      events.push({
        id: row.id,
        kind: "save",
        direction: "incoming",
        created_at: row.created_at,
        song_name: post?.lyric_projects?.title,
      });
    }

    for (const row of follows ?? []) {
      events.push({
        id: row.id,
        kind: "follow",
        direction: row.follower_user_id === partnerId ? "incoming" : "outgoing",
        created_at: row.created_at,
      });
    }

    for (const row of messages ?? []) {
      events.push({
        id: row.id,
        kind: "message",
        direction: row.sender_id === myId ? "outgoing" : "incoming",
        created_at: row.created_at,
        text: row.content,
        sender_id: row.sender_id,
        is_read: row.is_read,
      });
    }

    events.sort((a, b) => a.created_at.localeCompare(b.created_at));

    return new Response(
      JSON.stringify({ events, thread_id: thread?.id ?? null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    console.error("get-thread-activity error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
