/**
 * PublishHookButton — Publishes a hook to a shareable page.
 * Extracts the hook audio clip, uploads to storage, and creates a shareable_hooks record.
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
      // Get artist display name for slug
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      const displayName = profile?.display_name || artistName || "artist";
      const artistSlug = slugify(displayName);
      const songSlug = slugify(songTitle || "untitled");

      // Derive hook slug from the detonating lyric (last line text in hook region)
      const hookLines = lines.filter(l => l.start < hook.end && l.end > hook.start);
      const lastLine = hookLines[hookLines.length - 1];
      const hookPhrase = lastLine?.text || hook.previewText || "hook";
      const hookSlug = slugify(hookPhrase);

      if (!artistSlug || !songSlug || !hookSlug) {
        toast.error("Couldn't generate a valid URL — check song/artist name");
        setPublishing(false);
        return;
      }

      // Extract audio clip (hook region) — upload full file for now
      // The engine handles playback region internally
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

      // Create shareable hook record
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
        }, { onConflict: "artist_slug,song_slug,hook_slug" });

      if (insertError) throw insertError;

      const url = `/${artistSlug}/${songSlug}/${hookSlug}`;
      setPublishedUrl(url);
      toast.success("Hook published!");
    } catch (e: any) {
      console.error("Publish error:", e);
      toast.error(e.message || "Failed to publish hook");
    } finally {
      setPublishing(false);
    }
  }, [user, hook, physicsSpec, lines, beatGrid, audioFile, songTitle, artistName, system, palette, fingerprint, publishing]);

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
        <span>View Published Hook</span>
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
          <span>Publish Hook Page</span>
        </>
      )}
    </button>
  );
}
