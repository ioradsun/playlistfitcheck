/**
 * PublishHookButton — Publishes one or two hooks to shareable pages.
 * When two hooks exist, creates a "battle" with a shared battle_id.
 */

import { useState, useCallback } from "react";
import { ExternalLink, Loader2, Check } from "lucide-react";
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
  physicsSpec: PhysicsSpec;
  lines: LyricLine[];
  beatGrid: { bpm: number; beats: number[]; confidence: number };
  audioFile: File;
  songTitle: string;
  artistName: string;
  system: string;
  palette: string[];
  fingerprint?: ArtistDNA | null;
}

export function PublishHookButton({
  hook,
  secondHook,
  hookLabel,
  secondHookLabel,
  physicsSpec,
  lines,
  beatGrid,
  audioFile,
  songTitle,
  artistName,
  system,
  palette,
  fingerprint,
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

      const displayName = profile?.display_name || artistName || "artist";
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
          physics_spec: physicsSpec,
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
            physics_spec: physicsSpec,
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

      const url = `/${artistSlug}/${songSlug}/${hookSlug}`;
      setPublishedUrl(url);
      toast.success(hasBattle ? "Hook Battle published!" : "Hook published!");
    } catch (e: any) {
      console.error("Publish error:", e);
      toast.error(e.message || "Failed to publish hook");
    } finally {
      setPublishing(false);
    }
  }, [user, hook, secondHook, hookLabel, secondHookLabel, physicsSpec, lines, beatGrid, audioFile, songTitle, artistName, system, palette, fingerprint, publishing]);

  if (!user) return null;

  if (publishedUrl) {
    return (
      <a
        href={publishedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center justify-center gap-1.5 text-[10px] font-mono text-green-400/80 hover:text-green-400 transition-colors border border-green-500/20 hover:border-green-500/40 rounded-lg py-1.5"
      >
        <Check size={10} />
        <span>{secondHook ? "View Hook Battle" : "View Published Hook"}</span>
        <ExternalLink size={9} />
      </a>
    );
  }

  return (
    <button
      onClick={handlePublish}
      disabled={publishing}
      className="w-full flex items-center justify-center gap-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors border border-border/30 hover:border-foreground/40 rounded-lg py-1.5 disabled:opacity-50"
    >
      {publishing ? (
        <>
          <Loader2 size={10} className="animate-spin" />
          <span>Publishing…</span>
        </>
      ) : (
        <>
          <ExternalLink size={10} />
          <span>{secondHook ? "Publish Hook Battle" : "Publish Hook Page"}</span>
        </>
      )}
    </button>
  );
}
