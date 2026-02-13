import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;

    let res: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await fetchWithTimeout(oembedUrl, 8000);
        if (res.ok) break;
      } catch {
        // timeout or network error, retry once
        res = null;
      }
    }

    if (!res || !res.ok) {
      const status = res?.status ?? 504;
      const text = res ? await res.text().catch(() => "timeout") : "Request timed out";
      return new Response(JSON.stringify({ error: `Spotify oEmbed error: ${status}`, details: text }), {
        status: status >= 500 ? 502 : status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();

    return new Response(
      JSON.stringify({
        title: data.title ?? null,
        thumbnail_url: data.thumbnail_url ?? null,
        type: data.type ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
