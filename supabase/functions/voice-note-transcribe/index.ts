import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { audio_url, comment_id } = await req.json();
    if (!audio_url || !comment_id) {
      return new Response(
        JSON.stringify({ error: "Missing audio_url or comment_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const audioRes = await fetch(audio_url);
    if (!audioRes.ok) throw new Error(`Audio fetch failed: ${audioRes.status}`);
    const audioBytes = new Uint8Array(await audioRes.arrayBuffer());

    const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!elevenLabsKey) throw new Error("Missing ELEVENLABS_API_KEY");

    const form = new FormData();
    const blob = new Blob([audioBytes], { type: "audio/webm" });
    form.append("file", blob, "voice.webm");
    form.append("model_id", "scribe_v2");

    const scribeRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": elevenLabsKey },
      body: form,
    });

    if (!scribeRes.ok) {
      const err = await scribeRes.text();
      throw new Error(`Scribe error ${scribeRes.status}: ${err.slice(0, 200)}`);
    }

    const scribeData = await scribeRes.json();
    const text = (scribeData.text ?? "").trim();

    if (text) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseKey);

      await sb
        .from("project_comments")
        .update({ text })
        .eq("id", comment_id);
    }

    return new Response(
      JSON.stringify({ text }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
