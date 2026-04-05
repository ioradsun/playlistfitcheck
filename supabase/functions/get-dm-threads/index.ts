import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const myId = user.id;

    const { data: threads } = await supabase
      .from("dm_threads")
      .select("id, user_a_id, user_b_id, last_activity_at")
      .or(`user_a_id.eq.${myId},user_b_id.eq.${myId}`)
      .order("last_activity_at", { ascending: false })
      .limit(50);

    const partnerIds = (threads ?? []).map((t) =>
      t.user_a_id === myId ? t.user_b_id : t.user_a_id,
    );

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, trailblazer_number")
      .in("id", partnerIds);

    const threadIds = (threads ?? []).map((t) => t.id);
    const { data: unreadCounts } = threadIds.length > 0
      ? await supabase
          .from("dm_messages")
          .select("thread_id")
          .in("thread_id", threadIds)
          .eq("is_read", false)
          .neq("sender_id", myId)
      : { data: [] };

    const unreadByThread: Record<string, number> = {};
    for (const row of unreadCounts ?? []) {
      unreadByThread[row.thread_id] = (unreadByThread[row.thread_id] ?? 0) + 1;
    }

    const threadIdsWithMessages = threadIds;
    const latestMessageResults = threadIdsWithMessages.length > 0
      ? await Promise.all(
          threadIdsWithMessages.map((tid) =>
            supabase
              .from("dm_messages")
              .select("thread_id, content, created_at, sender_id")
              .eq("thread_id", tid)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          ),
        )
      : [];
    const latestByThread: Record<string, any> = {};
    for (const { data } of latestMessageResults) {
      if (data) latestByThread[data.thread_id] = data;
    }

    const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));

    const result = (threads ?? []).map((t) => {
      const partnerId = t.user_a_id === myId ? t.user_b_id : t.user_a_id;
      const partner = profileMap[partnerId];
      return {
        thread_id: t.id,
        partner_id: partnerId,
        partner_name: partner?.display_name ?? "Unknown",
        partner_avatar: partner?.avatar_url ?? null,
        fmly_number: typeof partner?.trailblazer_number === "number"
          ? String(partner.trailblazer_number).padStart(4, "0")
          : null,
        last_activity_at: t.last_activity_at,
        unread_count: unreadByThread[t.id] ?? 0,
        last_message_preview: latestByThread[t.id]?.content?.slice(0, 80) ?? null,
        last_message_is_mine: latestByThread[t.id]?.sender_id === myId,
      };
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const existingPartnerIds = new Set(partnerIds);

    const { data: recentFirers } = await supabase
      .from("lyric_dance_fires")
      .select(`
        user_id, created_at,
        shareable_lyric_dances!inner(user_id)
      `)
      .eq("shareable_lyric_dances.user_id", myId)
      .not("user_id", "is", null)
      .neq("user_id", myId)
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(100);

    const activityOnlyUsers = new Map<string, string>();
    for (const row of recentFirers ?? []) {
      const uid = row.user_id;
      if (!uid || existingPartnerIds.has(uid)) continue;
      if (!activityOnlyUsers.has(uid) || row.created_at > activityOnlyUsers.get(uid)!) {
        activityOnlyUsers.set(uid, row.created_at);
      }
    }

    const activityOnlyIds = [...activityOnlyUsers.keys()];
    const { data: activityProfiles } = activityOnlyIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, trailblazer_number")
          .in("id", activityOnlyIds)
      : { data: [] };

    const activityOnlyResults = (activityProfiles ?? []).map((p) => ({
      thread_id: null,
      partner_id: p.id,
      partner_name: p.display_name ?? "Unknown",
      partner_avatar: p.avatar_url ?? null,
      fmly_number: typeof p.trailblazer_number === "number"
        ? String(p.trailblazer_number).padStart(4, "0")
        : null,
      last_activity_at: activityOnlyUsers.get(p.id)!,
      unread_count: 0,
      last_message_preview: null,
      last_message_is_mine: false,
    }));

    const allResults = [...result, ...activityOnlyResults]
      .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at));

    return new Response(JSON.stringify({ threads: allResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    console.error("get-dm-threads error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
