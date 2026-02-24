import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { dance_id } = await req.json();
    if (!dance_id) return new Response(JSON.stringify({ error: "dance_id required" }), { status: 400, headers: corsHeaders });

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get the dance record
    const { data: dance, error: dErr } = await sb
      .from("shareable_lyric_dances")
      .select("id, user_id, song_name")
      .eq("id", dance_id)
      .single();

    if (dErr || !dance) return new Response(JSON.stringify({ error: "Dance not found" }), { status: 404, headers: corsHeaders });

    // Find matching saved_lyrics (service role bypasses RLS)
    const { data: lyric } = await sb
      .from("saved_lyrics")
      .select("words")
      .eq("user_id", dance.user_id)
      .eq("title", dance.song_name)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const words = lyric?.words;
    const count = Array.isArray(words) ? words.length : 0;

    if (!words || count === 0) {
      return new Response(JSON.stringify({ error: "No words in saved project", count: 0 }), { status: 404, headers: corsHeaders });
    }

    // Update the shareable dance
    const { error: uErr } = await sb
      .from("shareable_lyric_dances")
      .update({ words, updated_at: new Date().toISOString() })
      .eq("id", dance_id);

    if (uErr) throw uErr;

    return new Response(JSON.stringify({ ok: true, count }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
