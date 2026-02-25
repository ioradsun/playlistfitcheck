/**
 * PublishLyricDanceButton — Publishes a full-song lyric dance to a shareable page.
 * Route: /:artistSlug/:songSlug/lyric-dance
 *
 * Now also derives a SceneManifest from Song DNA + PhysicsSpec,
 * calls lyric-video-bg to generate an AI cinematic background,
 * and persists both alongside the lyric dance record.
 */

import { useState, useCallback } from "react";
import { Loader2, Film } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { slugify } from "@/lib/slugify";
// deriveSceneManifestFromSpec fallback removed — sceneManifest must come from props
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { LyricLine } from "./LyricDisplay";
import type { ArtistDNA } from "./ArtistFingerprintTypes";

interface SongDna {
  mood?: string;
  description?: string;
  meaning?: { theme?: string; summary?: string; imagery?: string[] };
  scene_manifest?: any;
  sceneManifest?: any;
  [key: string]: any;
}

interface Props {
  physicsSpec: PhysicsSpec;
  lines: LyricLine[];
  beatGrid: { bpm: number; beats: number[]; confidence: number };
  audioFile: File;
  songTitle: string;
  system: string;
  palette: string[];
  fingerprint?: ArtistDNA | null;
  seed: string;
  songDna?: SongDna | null;
  words?: Array<{ word: string; start: number; end: number }> | null;
}

export function PublishLyricDanceButton({
  physicsSpec,
  lines,
  beatGrid,
  audioFile,
  songTitle,
  system,
  palette,
  fingerprint,
  seed,
  songDna,
  words,
}: Props) {
  const { user } = useAuth();
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const handlePublish = useCallback(async () => {
    if (!user || publishing) return;
    setPublishing(true);
    setStatus("Preparing…");

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      const displayName = profile?.display_name || "artist";
      const artistSlug = slugify(displayName);
      const songSlug = slugify(songTitle || "untitled");

      if (!artistSlug || !songSlug) {
        toast.error("Couldn't generate a valid URL — check song/artist name");
        setPublishing(false);
        setStatus("");
        return;
      }

      // ── Upload audio ──────────────────────────────────────────────
      setStatus("Uploading audio…");
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

      // ── Scene manifest from props (no fallback derivation) ────────
      setStatus("Building scene…");
      const sceneManifest =
        songDna?.scene_manifest ||
        songDna?.sceneManifest ||
        null;

      const backgroundUrl: string | null = null;

      // ── Filter to main lines ──────────────────────────────────────
      const mainLines = lines.filter(l => l.tag !== "adlib");

      // ── Upsert lyric dance ────────────────────────────────────────
      setStatus("Publishing…");
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
          scene_manifest: sceneManifest,
          background_url: backgroundUrl,
          words: words ?? null,
        }, { onConflict: "artist_slug,song_slug" });

      if (insertError) throw insertError;

      const url = `/${artistSlug}/${songSlug}/lyric-dance`;
      setPublishedUrl(url);
      toast.success("Lyric Dance page published!");

      // ── Auto-post to CrowdFit (fire-and-forget) ──────────────
      (async () => {
        try {
          const { data: danceRow }: any = await supabase
            .from("shareable_lyric_dances" as any)
            .select("id")
            .eq("artist_slug", artistSlug)
            .eq("song_slug", songSlug)
            .single();

          if (!danceRow?.id) return;
          const danceId = danceRow.id;

          // Check for existing CrowdFit post with this dance
          const { data: existing } = await supabase
            .from("songfit_posts" as any)
            .select("id")
            .eq("user_id", user.id)
            .eq("lyric_dance_id", danceId)
            .maybeSingle();

          if (existing) {
            // Update existing post's URL
            await supabase
              .from("songfit_posts" as any)
              .update({ lyric_dance_url: url })
              .eq("id", (existing as any).id);
          } else {
            // Insert new CrowdFit post
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 21);

            await supabase
              .from("songfit_posts" as any)
              .insert({
                user_id: user.id,
                track_title: songTitle || "Untitled",
                caption: "",
                lyric_dance_url: url,
                lyric_dance_id: danceId,
                spotify_track_url: null,
                spotify_track_id: null,
                album_art_url: null,
                tags_json: [],
                track_artists_json: [],
                status: "live",
                submitted_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString(),
              });
          }

          window.dispatchEvent(new Event("songfit:dance-published"));
          console.log("[PUBLISH] CrowdFit post created for lyric dance");
        } catch (e: any) {
          console.warn("[PUBLISH] CrowdFit auto-post failed (non-blocking):", e?.message);
        }
      })();

      // Fire-and-forget: generate section background images
      // Need the actual shareable dance ID for the edge function
      const cinematicDir = songDna?.cinematicDirection ?? songDna?.cinematic_direction;
      const sections = cinematicDir?.sections;
      if (Array.isArray(sections) && sections.length > 0) {
        // Fetch the dance ID we just upserted
        supabase
          .from("shareable_lyric_dances" as any)
          .select("id")
          .eq("artist_slug", artistSlug)
          .eq("song_slug", songSlug)
          .single()
          .then(({ data: danceRow }: any) => {
            if (!danceRow?.id) return;
            supabase.functions.invoke("generate-section-images", {
              body: {
                lyric_dance_id: danceRow.id,
              },
            }).then(({ data: imgResult }) => {
              console.log("[PUBLISH] Section images generated:", imgResult?.generated ?? 0);
            }).catch((e: any) => {
              console.warn("[PUBLISH] Section images failed (non-blocking):", e?.message);
            });
          });
      }
    } catch (e: any) {
      console.error("Publish error:", e);
      toast.error(e.message || "Failed to publish lyric dance");
    } finally {
      setPublishing(false);
      setStatus("");
    }
  }, [user, physicsSpec, lines, beatGrid, audioFile, songTitle, system, palette, fingerprint, seed, publishing, songDna]);

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
        <span className="flex items-center gap-1.5">
          <Loader2 size={10} className="animate-spin" />
          <span>{status || "PUBLISHING…"}</span>
        </span>
      ) : (
        <>
          <Film size={10} />
          PUBLISH LYRIC DANCE
        </>
      )}
    </button>
  );
}
