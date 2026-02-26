/**
 * PublishHookButton — Publishes one or two hooks to shareable pages.
 * When two hooks exist, creates a "battle" with a shared battle_id.
 */

import { useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { slugify } from "@/lib/slugify";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { LyricLine, LyricHook } from "./LyricDisplay";
import type { ArtistDNA } from "./ArtistFingerprintTypes";

interface Props {
  hook: LyricHook;
  secondHook?: LyricHook | null;
  hookLabel?: string;
  secondHookLabel?: string;
  motionProfileSpec: PhysicsSpec;
  lines: LyricLine[];
  beatGrid: { bpm: number; beats: number[]; confidence: number };
  audioFile: File;
  songTitle: string;
  system: string;
  palette: string[];
  fingerprint?: ArtistDNA | null;
  onViewBattle?: (url: string) => void;
}

export function PublishHookButton({
  hook,
  secondHook,
  hookLabel,
  secondHookLabel,
  motionProfileSpec,
  lines,
  beatGrid,
  audioFile,
  songTitle,
  system,
  palette,
  fingerprint,
  onViewBattle,
}: Props) {
  const { user } = useAuth();
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  const handlePublish = useCallback(async () => {
    if (!user || publishing) return;
    setPublishing(true);

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      const displayName = profile?.display_name || "artist";
      const artistSlug = slugify(displayName);
      const songSlug = slugify(songTitle || "untitled");

      // Helper to derive hook slug from lyric content
      const deriveHookSlug = (h: LyricHook): string => {
        const hookLines = lines.filter(l => l.start < h.end && l.end > h.start);
        const lastLine = hookLines[hookLines.length - 1];
        const hookPhrase = lastLine?.text || h.previewText || "hook";
        return slugify(hookPhrase);
      };

      const hookSlug = deriveHookSlug(hook);

      if (!artistSlug || !songSlug || !hookSlug) {
        toast.error("Couldn't generate a valid URL — check song/artist name");
        setPublishing(false);
        return;
      }

      // Upload audio
      const fileExt = audioFile.name.split(".").pop() || "webm";
      const storagePath = `${user.id}/${artistSlug}/${songSlug}/${hookSlug}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("audio-clips")
        .upload(storagePath, audioFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("audio-clips")
        .getPublicUrl(storagePath);

      const audioUrl = urlData.publicUrl;

      // Generate battle_id if two hooks
      const hasBattle = !!secondHook;
      const battleId = hasBattle ? crypto.randomUUID() : null;

      const hookLines = lines.filter(l => l.start < hook.end && l.end > hook.start);
      const lastLine = hookLines[hookLines.length - 1];
      const hookPhrase = lastLine?.text || hook.previewText || "hook";

      // Upsert primary hook
      const { error: insertError } = await supabase
        .from("shareable_hooks" as any)
        .upsert({
          user_id: user.id,
          artist_slug: artistSlug,
          song_slug: songSlug,
          hook_slug: hookSlug,
          artist_name: displayName,
          song_name: songTitle,
          hook_phrase: hookPhrase,
          artist_dna: fingerprint || null,
          motion_profile_spec: motionProfileSpec,
          beat_grid: beatGrid,
          hook_start: hook.start,
          hook_end: hook.end,
          lyrics: hookLines,
          audio_url: audioUrl,
          system_type: system,
          palette,
          signature_line: fingerprint?.tension_signature?.signature_line || null,
          battle_id: battleId,
          battle_position: hasBattle ? 1 : null,
          hook_label: hookLabel || null,
        }, { onConflict: "artist_slug,song_slug,hook_slug" });

      if (insertError) throw insertError;

      // Upsert second hook if it exists
      if (secondHook && battleId) {
        const secondHookSlug = deriveHookSlug(secondHook);
        const secondHookLines = lines.filter(l => l.start < secondHook.end && l.end > secondHook.start);
        const secondLastLine = secondHookLines[secondHookLines.length - 1];
        const secondHookPhrase = secondLastLine?.text || secondHook.previewText || "hook-2";

        const { error: secondError } = await supabase
          .from("shareable_hooks" as any)
          .upsert({
            user_id: user.id,
            artist_slug: artistSlug,
            song_slug: songSlug,
            hook_slug: secondHookSlug || `${hookSlug}-2`,
            artist_name: displayName,
            song_name: songTitle,
            hook_phrase: secondHookPhrase,
            artist_dna: fingerprint || null,
            motion_profile_spec: motionProfileSpec,
            beat_grid: beatGrid,
            hook_start: secondHook.start,
            hook_end: secondHook.end,
            lyrics: secondHookLines,
            audio_url: audioUrl,
            system_type: system,
            palette,
            signature_line: fingerprint?.tension_signature?.signature_line || null,
            battle_id: battleId,
            battle_position: 2,
            hook_label: secondHookLabel || null,
          }, { onConflict: "artist_slug,song_slug,hook_slug" });

        if (secondError) throw secondError;
      }

      // Auto-publish to HookFit feed for battles
      if (hasBattle && battleId) {
        // Get the primary hook's ID for the feed post
        const { data: primaryHook } = await supabase
          .from("shareable_hooks" as any)
          .select("id")
          .eq("artist_slug", artistSlug)
          .eq("song_slug", songSlug)
          .eq("hook_slug", hookSlug)
          .maybeSingle();

        if (primaryHook) {
          await supabase
            .from("hookfit_posts" as any)
            .upsert({
              user_id: user.id,
              battle_id: battleId,
              hook_id: (primaryHook as any).id,
              status: "live",
            }, { onConflict: "battle_id" });

          // Dispatch event for UI sync
          window.dispatchEvent(new Event("hookfit:battle-published"));
        }
      }

      const url = `/${artistSlug}/${songSlug}/${hookSlug}`;
      setPublishedUrl(url);
      toast.success(hasBattle ? "Hook Battle published!" : "Hook published!");
    } catch (e: any) {
      console.error("Publish error:", e);
      toast.error(e.message || "Failed to publish hook");
    } finally {
      setPublishing(false);
    }
  }, [user, hook, secondHook, hookLabel, secondHookLabel, motionProfileSpec, lines, beatGrid, audioFile, songTitle, system, palette, fingerprint, publishing]);

  if (!user) return null;

  const buttonClass = "w-full text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors border rounded-lg py-2 disabled:opacity-50 text-foreground hover:text-primary border-border/40 hover:border-primary/40";

  if (publishedUrl) {
    return (
      <button
        onClick={onViewBattle ? () => onViewBattle(publishedUrl) : undefined}
        className={buttonClass}
      >
        {secondHook ? "VIEW HOOK BATTLE" : "VIEW PUBLISHED HOOK"}
      </button>
    );
  }

  return (
    <button
      onClick={handlePublish}
      disabled={publishing}
      className={buttonClass}
    >
      {publishing ? (
        <>
          <Loader2 size={10} className="inline animate-spin mr-1.5" />
          PUBLISHING…
        </>
      ) : (
        secondHook ? "START BATTLE" : "PUBLISH HOOK PAGE"
      )}
    </button>
  );
}
