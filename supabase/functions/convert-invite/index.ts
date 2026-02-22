import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { inviteCode } = await req.json();
    if (!inviteCode) {
      return new Response(JSON.stringify({ error: "Missing invite code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get auth user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // User client to get current user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client for cross-user updates
    const admin = createClient(supabaseUrl, serviceKey);

    // Find inviter by invite_code
    const { data: inviter } = await admin
      .from("profiles")
      .select("id, invite_code")
      .eq("invite_code", inviteCode)
      .single();

    if (!inviter) {
      return new Response(JSON.stringify({ error: "Invalid invite code" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Don't allow self-invite
    if (inviter.id === user.id) {
      return new Response(JSON.stringify({ error: "Cannot use your own invite code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already converted
    const { data: existing } = await admin
      .from("invites")
      .select("id")
      .eq("invite_code", inviteCode)
      .eq("invitee_user_id", user.id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ message: "Already converted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record conversion
    await admin.from("invites").insert({
      inviter_user_id: inviter.id,
      invite_code: inviteCode,
      invitee_user_id: user.id,
      converted_at: new Date().toISOString(),
    });

    // Unlock unlimited for inviter
    await admin
      .from("profiles")
      .update({ is_unlimited: true })
      .eq("id", inviter.id);

    // Award collab points to inviter
    const { data: points } = await admin
      .from("collab_points")
      .select("id, points")
      .eq("user_id", inviter.id)
      .maybeSingle();

    if (points) {
      const newPoints = points.points + 100;
      const badge = newPoints >= 1000 ? "growth_engine" : newPoints >= 300 ? "chain_builder" : "collab_starter";
      await admin
        .from("collab_points")
        .update({ points: newPoints, badge, updated_at: new Date().toISOString() })
        .eq("id", points.id);
    } else {
      await admin.from("collab_points").insert({
        user_id: inviter.id,
        points: 100,
        badge: "collab_starter",
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    console.error("convert-invite error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
