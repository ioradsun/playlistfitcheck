import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, dance_id } = await req.json();
    const id = project_id ?? dance_id;
    if (!id) {
      return new Response(JSON.stringify({ error: "project_id required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: project, error } = await sb
      .from("lyric_projects")
      .select("id, words")
      .eq("id", id)
      .single();

    if (error || !project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    const count = Array.isArray(project.words) ? project.words.length : 0;
    return new Response(JSON.stringify({ ok: true, count }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
