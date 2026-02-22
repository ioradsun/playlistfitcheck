/**
 * PublishLyricDanceButton — Publishes a full-song lyric dance to a shareable page.
 * Route: /:artistSlug/:songSlug/lyric-dance
 */

import { useState, useCallback } from "react";
import { Loader2, Film } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { slugify } from "@/lib/slugify";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { LyricLine } from "./LyricDisplay";
import type { ArtistDNA } from "./ArtistFingerprintTypes";

interface Props {
  physicsSpec: PhysicsSpec;
  lines: LyricLine[];
  beatGrid: { bpm: number; beats: number[]; confidence: number };
  audioFile: File;
  songTitle: string;
  artistName: string;
  system: string;
  palette: string[];
  fingerprint?: ArtistDNA | null;
  seed: string;
}

export function PublishLyricDanceButton({
  physicsSpec,
  lines,
  beatGrid,
  audioFile,
  songTitle,
  artistName,
  system,
  palette,
  fingerprint,
  seed,
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

      if (!artistSlug || !songSlug) {
        toast.error("Couldn't generate a valid URL — check song/artist name");
        setPublishing(false);
        return;
      }

      // Upload audio
      const fileExt = audioFile.name.split(".").pop() || "webm";
      const storagePath = `${user.id}/${artistSlug}/${songSlug}/lyric-dance.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("audio-clips")
        .upload(storagePath, audioFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("audio-clips")
        .getPublicUrl(storagePath);

      const audioUrl = urlData.publicUrl;

      // Filter to main lines only
      const mainLines = lines.filter(l => l.tag !== "adlib");

      // Upsert lyric dance
      const { error: insertError } = await supabase
        .from("shareable_lyric_dances" as any)
        .upsert({
          user_id: user.id,
          artist_slug: artistSlug,
          song_slug: songSlug,
          artist_name: displayName,
          song_name: songTitle,
          audio_url: audioUrl,
          lyrics: mainLines,
          physics_spec: physicsSpec,
          beat_grid: beatGrid,
          palette,
          system_type: system,
          artist_dna: fingerprint || null,
          seed,
        }, { onConflict: "artist_slug,song_slug" });

      if (insertError) throw insertError;

      const url = `/${artistSlug}/${songSlug}/lyric-dance`;
      setPublishedUrl(url);
      toast.success("Lyric Dance page published!");
    } catch (e: any) {
      console.error("Publish error:", e);
      toast.error(e.message || "Failed to publish lyric dance");
    } finally {
      setPublishing(false);
    }
  }, [user, physicsSpec, lines, beatGrid, audioFile, songTitle, artistName, system, palette, fingerprint, seed, publishing]);

  if (!user) return null;

  const buttonClass = "w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors border rounded-lg py-2 disabled:opacity-50 text-foreground hover:text-primary border-border/40 hover:border-primary/40";

  if (publishedUrl) {
    return (
      <a
        href={publishedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass}
      >
        VIEW LYRIC DANCE PAGE
      </a>
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
          <Loader2 size={10} className="animate-spin" />
          PUBLISHING…
        </>
      ) : (
        <>
          <Film size={10} />
          PUBLISH LYRIC DANCE
        </>
      )}
    </button>
  );
}
