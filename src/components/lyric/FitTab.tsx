/**
 * FitTab — Displays analysis results with waveform + beat markers.
 * Centered single-column layout for readability.
 * Pipeline runs in LyricFitTab parent.
 * v2: removed lyrics column, single-column report.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, RefreshCw, Music, Sparkles, Eye, Palette, Zap, Image, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { slugify } from "@/lib/slugify";
import { LyricWaveform } from "./LyricWaveform";
import type { WaveformData } from "@/hooks/useAudioEngine";
import type { LyricLine, LyricData } from "./LyricDisplay";
import type { BeatGridData } from "@/hooks/useBeatGrid";
import type { SongSignature } from "@/lib/songSignatureAnalyzer";
import type { SceneManifest as FullSceneManifest } from "@/engine/SceneManifest";
import type { AudioSection } from "@/engine/sectionDetector";
import type { HeaderProjectSetter } from "./LyricsTab";
import type { GenerationStatus } from "./LyricFitTab";

const PEAK_SAMPLES = 200;

function extractPeaks(buffer: AudioBuffer, samples: number): number[] {
  const channel = buffer.getChannelData(0);
  const blockSize = Math.floor(channel.length / samples);
  const peaks: number[] = [];
  for (let i = 0; i < samples; i++) {
    let max = 0;
    const start = i * blockSize;
    for (let j = 0; j < blockSize; j++) {
      const v = Math.abs(channel[start + j]);
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  const maxPeak = Math.max(...peaks, 0.01);
  return peaks.map((p) => p / maxPeak);
}

interface Props {
  lyricData: LyricData;
  audioFile: File;
  hasRealAudio: boolean;
  savedId: string | null;
  songDna: any | null;
  setSongDna: (d: any) => void;
  beatGrid: BeatGridData | null;
  setBeatGrid: (g: BeatGridData | null) => void;
  songSignature: SongSignature | null;
  setSongSignature: (s: SongSignature | null) => void;
  sceneManifest: FullSceneManifest | null;
  setSceneManifest: (m: FullSceneManifest | null) => void;
  cinematicDirection: any | null;
  setCinematicDirection: (d: any) => void;
  bgImageUrl: string | null;
  setBgImageUrl: (u: string | null) => void;
  generationStatus: GenerationStatus;
  audioSections?: AudioSection[];
  words?: Array<{ word: string; start: number; end: number }> | null;
  onRetry?: () => void;
  onHeaderProject?: HeaderProjectSetter;
  onBack?: () => void;
}

export function FitTab({
  lyricData,
  audioFile,
  hasRealAudio,
  savedId,
  songDna,
  setSongDna,
  beatGrid,
  setBeatGrid,
  songSignature,
  setSongSignature,
  sceneManifest,
  setSceneManifest,
  cinematicDirection,
  setCinematicDirection,
  bgImageUrl,
  setBgImageUrl,
  generationStatus,
  audioSections,
  words,
  onRetry,
  onHeaderProject,
  onBack,
}: Props) {
  const { user } = useAuth();
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState("");
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishedLyricsHash, setPublishedLyricsHash] = useState<string | null>(null);

  // ── Battle publish state ──────────────────────────────────────────────
  const [battlePublishing, setBattlePublishing] = useState(false);
  const [battlePublishedUrl, setBattlePublishedUrl] = useState<string | null>(null);

  // Simple hash of lyrics to detect transcript changes
  const computeLyricsHash = useCallback((lns: LyricLine[]) => {
    const text = lns.filter(l => l.tag !== "adlib").map(l => `${l.text}|${l.start}|${l.end}`).join("\n");
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return String(hash);
  }, []);

  const currentLyricsHash = lyricData?.lines ? computeLyricsHash(lyricData.lines) : null;
  const danceNeedsRegeneration = !publishedUrl || (publishedLyricsHash !== null && currentLyricsHash !== publishedLyricsHash);

  // Check for existing published dance on load
  useEffect(() => {
    if (!user || !lyricData) return;
    const songSlug = slugify(lyricData.title || "untitled");
    if (!songSlug) return;

    // Look up by user_id + song_slug (artist_slug may differ between artist name and display_name)
    supabase
      .from("shareable_lyric_dances" as any)
      .select("artist_slug, song_slug, lyrics")
      .eq("user_id", user.id)
      .eq("song_slug", songSlug)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setPublishedUrl(`/${data.artist_slug}/${data.song_slug}/lyric-dance`);
          const pubLines = Array.isArray(data.lyrics) ? data.lyrics : [];
          setPublishedLyricsHash(computeLyricsHash(pubLines));
        }
      });
  }, [user, lyricData, computeLyricsHash]);

  // ── Audio playback + waveform ─────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [waveform, setWaveform] = useState<WaveformData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!audioFile || audioFile.size === 0) return;

    const url = URL.createObjectURL(audioFile);
    const audio = new Audio(url);
    audio.preload = "auto";
    audioRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    const ctx = new AudioContext();
    audioFile.arrayBuffer().then((ab) => {
      ctx.decodeAudioData(ab).then((buf) => {
        setWaveform({ peaks: extractPeaks(buf, PEAK_SAMPLES), duration: buf.duration });
        ctx.close();
      });
    }).catch(() => {});

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      URL.revokeObjectURL(url);
      audioRef.current = null;
    };
  }, [audioFile]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying]);

  const handleSeek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }, []);

  // ── Header project ────────────────────────────────────────────────────
  useEffect(() => {
    if (!onHeaderProject) return;
    const title =
      lyricData.title && lyricData.title !== "Unknown" && lyricData.title !== "Untitled"
        ? lyricData.title
        : audioFile.name.replace(/\.[^.]+$/, "");
    onHeaderProject({ title, onBack: onBack ?? (() => {}) });
    return () => onHeaderProject(null);
  }, [lyricData.title, audioFile.name, onHeaderProject, onBack]);

// ── Cinematic Direction Card with Section Images ─────────────────────
function CinematicDirectionCard({ cinematicDirection, songTitle }: { cinematicDirection: any; songTitle: string }) {
  const [sectionImages, setSectionImages] = useState<(string | null)[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ done: number; total: number } | null>(null);
  const [danceId, setDanceId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sections: any[] = cinematicDirection.sections && Array.isArray(cinematicDirection.sections)
    ? cinematicDirection.sections
    : [];

  const songSlug = slugify(songTitle || "untitled");

  // Auto-load existing section images from the user's published dance
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user || cancelled) return;

      const { data: dances }: any = await supabase
        .from("shareable_lyric_dances" as any)
        .select("id, section_images")
        .eq("user_id", userData.user.id)
        .eq("song_slug", songSlug)
        .order("created_at", { ascending: false })
        .limit(1);

      if (cancelled || !dances?.[0]) return;
      setDanceId(dances[0].id);

      const imgs = dances[0].section_images;
      if (Array.isArray(imgs) && imgs.length > 0 && imgs.some(Boolean)) {
        setSectionImages(imgs);
      }
      // Don't auto-poll — let the user click "Generate Images" or wait for publish event
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [songSlug, sections.length]);

  // Listen for dance-published event to refresh images
  useEffect(() => {
    const handler = () => {
      setSectionImages([]);
      setGenerating(true);
      setGenProgress({ done: 0, total: sections.length });
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) return;
        const { data: dances }: any = await supabase
          .from("shareable_lyric_dances" as any)
          .select("id, section_images")
          .eq("user_id", userData.user.id)
          .eq("song_slug", songSlug)
          .limit(1);
        if (!dances?.[0]) return;
        setDanceId(dances[0].id);
        const imgs = dances[0].section_images;
        if (Array.isArray(imgs) && imgs.some(Boolean)) {
          setSectionImages(imgs);
          setGenProgress({ done: imgs.filter(Boolean).length, total: sections.length });
          setGenerating(false);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 3000);
      setTimeout(() => {
        if (pollRef.current) { clearInterval(pollRef.current); setGenerating(false); }
      }, 120_000);
    };
    window.addEventListener("songfit:dance-published", handler);
    return () => {
      window.removeEventListener("songfit:dance-published", handler);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sections.length]);

  const handleGenerateImages = useCallback(async () => {
    console.log("[SectionImages] Generate clicked", { generating, sectionsLen: sections.length, danceId });
    if (generating || !sections.length) return;
    if (!danceId) {
      toast.error("Publish a Dance first to generate section images");
      return;
    }
    setGenerating(true);
    setGenProgress({ done: 0, total: sections.length });
    try {
      const { data: result, error } = await supabase.functions.invoke("generate-section-images", {
        body: { lyric_dance_id: danceId, force: true },
      });
      if (error) throw error;
      const urls = result?.urls || result?.section_images || [];
      setSectionImages(urls);
      setGenProgress({ done: urls.filter(Boolean).length, total: sections.length });
      toast.success(`Generated ${urls.filter(Boolean).length}/${sections.length} section images`);
    } catch (e: any) {
      console.error("[SectionImages] Error:", e);
      toast.error(e?.message || "Failed to generate section images");
    } finally {
      setGenerating(false);
    }
  }, [generating, sections, danceId]);

  return (
    <div className="glass-card rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          <Eye size={10} />
          Cinematic Direction
        </div>
        {sections.length > 0 && (
          <button
            onClick={handleGenerateImages}
            disabled={generating}
            className="flex items-center gap-1 text-[9px] font-mono text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 size={9} className="animate-spin" />
                {genProgress ? `${genProgress.done}/${genProgress.total}` : "Generating…"}
              </>
            ) : sectionImages.length > 0 ? (
              <>
                <Image size={9} />
                Regenerate Images
              </>
            ) : (
              <>
                <Image size={9} />
                Generate Images
              </>
            )}
          </button>
        )}
      </div>

      {/* Song defaults */}
      <div className="flex flex-wrap gap-1">
        {cinematicDirection.sceneTone && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{cinematicDirection.sceneTone}</span>
        )}
        {cinematicDirection.atmosphere && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{cinematicDirection.atmosphere}</span>
        )}
        {cinematicDirection.motion && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{cinematicDirection.motion}</span>
        )}
        {cinematicDirection.typography && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{cinematicDirection.typography}</span>
        )}
        {cinematicDirection.texture && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{cinematicDirection.texture}</span>
        )}
        {cinematicDirection.emotionalArc && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">{cinematicDirection.emotionalArc}</span>
        )}
      </div>

      {/* All sections with descriptions + image status */}
      {sections.length > 0 && (
        <div className="space-y-2">
          <span className="text-[9px] font-mono text-muted-foreground/60 uppercase">Sections · {sections.length}</span>
          {sections.map((s: any, i: number) => {
            const imgUrl = sectionImages[i] ?? null;
            return (
              <div key={i} className="space-y-0.5">
                <div className="flex items-start gap-2">
                  <span className="text-[9px] font-mono text-primary/70 mt-0.5 whitespace-nowrap">§{s.sectionIndex ?? i}</span>
                  <p className="text-[10px] text-muted-foreground leading-tight flex-1">{s.description || s.mood || "No description"}</p>
                  {generating && !imgUrl && (
                    <Loader2 size={9} className="animate-spin text-muted-foreground/50 shrink-0 mt-0.5" />
                  )}
                  {imgUrl && (
                    <a
                      href={imgUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-0.5 text-[8px] font-mono text-primary hover:text-primary/80 shrink-0 mt-0.5"
                    >
                      <ExternalLink size={8} />
                      View
                    </a>
                  )}
                </div>
                {imgUrl && (
                  <div className="ml-6">
                    <a href={imgUrl} target="_blank" rel="noopener noreferrer">
                      <img
                        src={imgUrl}
                        alt={`Section ${s.sectionIndex ?? i} background`}
                        className="w-full max-w-[200px] h-auto rounded border border-border/30 opacity-80 hover:opacity-100 transition-opacity"
                        loading="lazy"
                      />
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {cinematicDirection.storyboard && Array.isArray(cinematicDirection.storyboard) && (
        <p className="text-[9px] text-muted-foreground/60">{cinematicDirection.storyboard.length} storyboard frames · {(cinematicDirection.wordDirectives?.length ?? 0)} word directives</p>
      )}
    </div>
  );
}


  const handleDance = useCallback(async () => {
    console.log("[FitTab] handleDance called", { user: !!user, sceneManifest: !!sceneManifest, lyricData: !!lyricData, audioFile: !!audioFile, publishing });
    if (!user) { toast.error("Sign in to publish your Dance"); return; }
    if (!sceneManifest || !lyricData || !audioFile || publishing) return;
    setPublishing(true);
    setPublishStatus("Preparing…");

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      const displayName = profile?.display_name || "artist";
      const artistSlug = slugify(displayName);
      const songSlug = slugify(lyricData.title || "untitled");

      if (!artistSlug || !songSlug) {
        toast.error("Couldn't generate a valid URL — check song/artist name");
        setPublishing(false);
        return;
      }

      setPublishStatus("Generating background…");
      let backgroundUrl: string | null = null;
      try {
        const { data: bgResult } = await supabase.functions.invoke("lyric-video-bg", {
          body: { manifest: sceneManifest, userDirection: `Song: ${lyricData.title}` },
        });
        backgroundUrl = bgResult?.imageUrl ?? null;
        setBgImageUrl(backgroundUrl);
      } catch {}

      setPublishStatus("Uploading audio…");
      const fileExt = audioFile.name.split(".").pop() || "webm";
      const storagePath = `${user.id}/${artistSlug}/${songSlug}/lyric-dance.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("audio-clips")
        .upload(storagePath, audioFile, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("audio-clips").getPublicUrl(storagePath);
      const audioUrl = urlData.publicUrl;

      setPublishStatus("Publishing…");
      const mainLines = lyricData.lines.filter((l) => l.tag !== "adlib");
      const physicsSpec = songDna?.physicsSpec || {};

      const { error: insertError } = await supabase
        .from("shareable_lyric_dances" as any)
        .upsert({
          user_id: user.id,
          artist_slug: artistSlug,
          song_slug: songSlug,
          artist_name: displayName,
          song_name: lyricData.title,
          audio_url: audioUrl,
          lyrics: mainLines,
          physics_spec: physicsSpec,
          beat_grid: beatGrid ? { bpm: beatGrid.bpm, beats: beatGrid.beats, confidence: beatGrid.confidence } : {},
          palette: physicsSpec.palette || ["#ffffff", "#a855f7", "#ec4899"],
          system_type: physicsSpec.system || "fracture",
          seed: `${lyricData.title}-lyric-dance`,
          scene_manifest: sceneManifest,
          background_url: backgroundUrl,
          cinematic_direction: cinematicDirection || null,
          words: words ?? null,
        }, { onConflict: "artist_slug,song_slug" });

      if (insertError) throw insertError;

      const url = `/${artistSlug}/${songSlug}/lyric-dance`;
      setPublishedUrl(url);
      setPublishedLyricsHash(currentLyricsHash);
      // ── Generate section images (blocking – the dance video needs them) ──
      setPublishStatus("Generating scene images…");
      const { data: danceRow }: any = await supabase
        .from("shareable_lyric_dances" as any)
        .select("id")
        .eq("artist_slug", artistSlug)
        .eq("song_slug", songSlug)
        .single();

      if (danceRow?.id) {
        const danceId = danceRow.id;
        try {
          const { data: imgResult } = await supabase.functions.invoke("generate-section-images", {
            body: { lyric_dance_id: danceId, force: true },
          });
          console.log("[FitTab] Section images generated:", imgResult?.generated ?? 0);
        } catch (e: any) {
          console.warn("[FitTab] Section images failed (non-blocking):", e?.message);
        }
      }

      toast.success("Lyric Dance page published!");

      // ── Auto-post to CrowdFit (fire-and-forget) ──
      (async () => {
        try {
          if (!danceRow?.id) return;
          const danceId = danceRow.id;

          const { data: existing }: any = await supabase
            .from("songfit_posts" as any)
            .select("id")
            .eq("user_id", user.id)
            .eq("lyric_dance_id", danceId)
            .maybeSingle();

          if (existing) {
            await supabase
              .from("songfit_posts" as any)
              .update({ lyric_dance_url: url })
              .eq("id", existing.id);
          } else {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 21);

            await supabase
              .from("songfit_posts" as any)
              .insert({
                user_id: user.id,
                track_title: lyricData.title || "Untitled",
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
          console.log("[FitTab] CrowdFit post created for lyric dance");
        } catch (e: any) {
          console.warn("[FitTab] CrowdFit auto-post failed (non-blocking):", e?.message);
        }
      })();
    } catch (e: any) {
      console.error("Dance publish error:", e);
      toast.error(e.message || "Failed to publish lyric dance");
    } finally {
      setPublishing(false);
      setPublishStatus("");
    }
  }, [user, sceneManifest, lyricData, audioFile, publishing, songDna, beatGrid, cinematicDirection, setBgImageUrl]);

  // ── Battle publish handler ──────────────────────────────────────────
  const handleStartBattle = useCallback(async () => {
    if (!user || battlePublishing) return;
    if (!songDna?.hook || !songDna?.secondHook || !audioFile || !lyricData) return;
    setBattlePublishing(true);

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      const displayName = profile?.display_name || "artist";
      const artistSlug = slugify(displayName);
      const songSlug = slugify(lyricData.title || "untitled");

      const deriveHookSlug = (h: any): string => {
        const hookLines = lyricData.lines.filter(l => l.start < h.end && l.end > h.start);
        const lastLine = hookLines[hookLines.length - 1];
        const hookPhrase = lastLine?.text || h.previewText || "hook";
        return slugify(hookPhrase);
      };

      const hookSlug = deriveHookSlug(songDna.hook);

      if (!artistSlug || !songSlug || !hookSlug) {
        toast.error("Couldn't generate a valid URL — check song/artist name");
        setBattlePublishing(false);
        return;
      }

      // Upload audio
      const fileExt = audioFile.name.split(".").pop() || "webm";
      const storagePath = `${user.id}/${artistSlug}/${songSlug}/${hookSlug}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("audio-clips")
        .upload(storagePath, audioFile, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("audio-clips").getPublicUrl(storagePath);
      const audioUrl = urlData.publicUrl;

      const battleId = crypto.randomUUID();
      const pSpec = songDna?.physicsSpec || {};
      const bg = beatGrid ? { bpm: beatGrid.bpm, beats: beatGrid.beats, confidence: beatGrid.confidence } : {};
      const palette = pSpec.palette || ["#ffffff", "#a855f7", "#ec4899"];
      const system = pSpec.system || "fracture";

      // Helper to build hook payload
      const buildHookPayload = (h: any, slug: string, position: number, label: string | null) => {
        const hookLines = lyricData.lines.filter(l => l.start < h.end && l.end > h.start);
        const lastLine = hookLines[hookLines.length - 1];
        const hookPhrase = lastLine?.text || h.previewText || "hook";
        return {
          user_id: user.id,
          artist_slug: artistSlug,
          song_slug: songSlug,
          hook_slug: slug,
          artist_name: displayName,
          song_name: lyricData.title,
          hook_phrase: hookPhrase,
          artist_dna: null,
          physics_spec: pSpec,
          beat_grid: bg,
          hook_start: h.start,
          hook_end: h.end,
          lyrics: hookLines,
          audio_url: audioUrl,
          system_type: system,
          palette,
          signature_line: null,
          battle_id: battleId,
          battle_position: position,
          hook_label: label,
        };
      };

      // Upsert hook 1
      const { error: e1 } = await supabase
        .from("shareable_hooks" as any)
        .upsert(buildHookPayload(songDna.hook, hookSlug, 1, songDna.hookLabel || null), { onConflict: "artist_slug,song_slug,hook_slug" });
      if (e1) throw e1;

      // Upsert hook 2
      const secondHookSlug = deriveHookSlug(songDna.secondHook);
      const { error: e2 } = await supabase
        .from("shareable_hooks" as any)
        .upsert(buildHookPayload(songDna.secondHook, secondHookSlug || `${hookSlug}-2`, 2, songDna.secondHookLabel || null), { onConflict: "artist_slug,song_slug,hook_slug" });
      if (e2) throw e2;

      // Upsert hookfit_posts
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
      }

      const battleUrl = `/${artistSlug}/${songSlug}/${hookSlug}`;
      setBattlePublishedUrl(battleUrl);

      // Auto-post to CrowdFit (fire-and-forget)
      (async () => {
        try {
          const { data: existing }: any = await supabase
            .from("songfit_posts" as any)
            .select("id")
            .eq("user_id", user.id)
            .eq("lyric_dance_url", battleUrl)
            .maybeSingle();

          if (!existing) {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 21);
            await supabase
              .from("songfit_posts" as any)
              .insert({
                user_id: user.id,
                track_title: lyricData.title || "Untitled",
                caption: "",
                lyric_dance_url: battleUrl,
                lyric_dance_id: null,
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
        } catch (e: any) {
          console.warn("[FitTab] CrowdFit battle auto-post failed:", e?.message);
        }
      })();

      window.dispatchEvent(new Event("hookfit:battle-published"));
      toast.success("Hook Battle published to CrowdFit!");
    } catch (e: any) {
      console.error("Battle publish error:", e);
      toast.error(e.message || "Failed to publish battle");
    } finally {
      setBattlePublishing(false);
    }
  }, [user, battlePublishing, songDna, audioFile, lyricData, beatGrid]);

  const allReady =
    generationStatus.beatGrid === "done" &&
    generationStatus.songDna === "done" &&
    generationStatus.cinematicDirection === "done";
  const hasErrors = Object.values(generationStatus).includes("error");
  const danceDisabled = !sceneManifest || publishing || !allReady;
  // Republish only needs auth + not currently publishing (data already exists on server)
  const republishDisabled = publishing;
  const hasBattle = !!(songDna?.hook && songDna?.secondHook);
  const battleDisabled = !allReady || battlePublishing || !hasBattle;

  

  // ── Sections derived from songDna ─────────────────────────────────────
  const physicsSpec = songDna?.physicsSpec;
  const meaning = songDna?.meaning;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex-1 px-4 py-6 space-y-4 max-w-2xl mx-auto">
      {/* Waveform — full width */}
      {hasRealAudio && (
        <div className="glass-card rounded-xl p-3">
          <LyricWaveform
            waveform={waveform}
            isPlaying={isPlaying}
            currentTime={currentTime}
            onSeek={handleSeek}
            onTogglePlay={handleTogglePlay}
            beats={beatGrid?.beats ?? null}
            beatGridLoading={false}
          />
        </div>
      )}

      {/* Single-column report */}
      <div className="space-y-3">
        {!allReady && (
            <div className="glass-card rounded-xl p-4 space-y-2">
              <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                {hasErrors ? "Some steps failed" : Object.values(generationStatus).some(v => v === "running") ? "Generating Fit in background" : "Analysis not yet complete"}
              </p>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div>Rhythm: {generationStatus.beatGrid}</div>
                <div>Song DNA: {generationStatus.songDna}</div>
                <div>Cinematic direction: {generationStatus.cinematicDirection}</div>
              </div>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="text-[11px] font-mono text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                >
                  <RefreshCw size={10} />
                  {hasErrors ? "Retry failed steps" : "Re-analyze"}
                </button>
              )}
            </div>
          )}

          {songDna?.description && (
            <div className="glass-card rounded-xl p-4 space-y-2">
              <p className="text-sm text-muted-foreground italic leading-relaxed">{songDna.description}</p>
              {songDna.mood && (
                <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {songDna.mood}
                </span>
              )}
            </div>
          )}

          {songDna && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Song DNA</span>
                {onRetry && hasErrors && (
                  <button
                    onClick={onRetry}
                    className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-primary transition-colors"
                  >
                    <RefreshCw size={10} />
                    Test Again
                  </button>
                )}
              </div>

              {meaning && (
                <div className="glass-card rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    <Sparkles size={10} />
                    Meaning
                  </div>
                  {meaning.theme && <p className="text-sm font-semibold text-foreground">{meaning.theme}</p>}
                  {meaning.narrative && <p className="text-xs text-muted-foreground leading-relaxed">{meaning.narrative}</p>}
                  {meaning.emotions && Array.isArray(meaning.emotions) && (
                    <div className="flex flex-wrap gap-1">
                      {meaning.emotions.map((e: string, i: number) => (
                        <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{e}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(songDna.hook || songDna.secondHook) && (
                <div className="glass-card rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    <Zap size={10} />
                    Hottest Hooks
                  </div>
                  {songDna.hook && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">{songDna.hookLabel || "Hook 1"}</span>
                        <span className="text-[9px] text-muted-foreground">{songDna.hook.start?.toFixed(1)}s – {songDna.hook.end?.toFixed(1)}s</span>
                        {songDna.hook.score && <span className="text-[9px] font-mono text-primary">{songDna.hook.score}%</span>}
                      </div>
                      {songDna.hookJustification && <p className="text-xs text-muted-foreground leading-relaxed">{songDna.hookJustification}</p>}
                </div>
              )}
              {songDna.secondHook && (
                <div className="space-y-1 pt-1 border-t border-border/20">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-accent/50 text-accent-foreground">{songDna.secondHookLabel || "Hook 2"}</span>
                    <span className="text-[9px] text-muted-foreground">{songDna.secondHook.start?.toFixed(1)}s – {songDna.secondHook.end?.toFixed(1)}s</span>
                  </div>
                  {songDna.secondHookJustification && <p className="text-xs text-muted-foreground leading-relaxed">{songDna.secondHookJustification}</p>}
                </div>
              )}

              {/* CrowdFit Battle button */}
              {hasBattle && (
                battlePublishedUrl ? (
                  <a
                    href={battlePublishedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors border rounded-lg py-2 text-foreground hover:text-primary border-border/40 hover:border-primary/40 mt-2"
                  >
                    <Zap size={10} />
                    VIEW BATTLE
                  </a>
                ) : (
                  <button
                    onClick={handleStartBattle}
                    disabled={battleDisabled}
                    className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors border rounded-lg py-2 disabled:opacity-50 text-foreground hover:text-primary border-border/40 hover:border-primary/40 mt-2"
                  >
                    {battlePublishing ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 size={10} className="animate-spin" />
                        PUBLISHING…
                      </span>
                    ) : (
                      <>
                        <Zap size={10} />
                        START CROWDFIT BATTLE
                      </>
                    )}
                  </button>
                )
              )}
                </div>
              )}

              {physicsSpec && (
                <div className="glass-card rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    <Palette size={10} />
                    Visual System
                  </div>
                  {physicsSpec.system && (
                    <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                      {physicsSpec.system}
                    </span>
                  )}
                  {physicsSpec.palette && Array.isArray(physicsSpec.palette) && (
                    <div className="flex items-center gap-1">
                      {physicsSpec.palette.map((c: string, i: number) => (
                        <div key={i} className="w-5 h-5 rounded-full border border-border/40" style={{ backgroundColor: c }} title={c} />
                      ))}
                    </div>
                  )}
                  {physicsSpec.typography && (
                    <p className="text-[10px] text-muted-foreground">
                      Font: <span className="text-foreground">{physicsSpec.typography.fontFamily || physicsSpec.typography}</span>
                    </p>
                  )}
                </div>
              )}

              {cinematicDirection && (
                <CinematicDirectionCard cinematicDirection={cinematicDirection} songTitle={lyricData.title} />
              )}

              {beatGrid && (
                <div className="glass-card rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    <Music size={10} />
                    Rhythm
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">{beatGrid.bpm.toFixed(0)} BPM</span>
                    <span className="text-[10px] text-muted-foreground">{Math.round((beatGrid.confidence ?? 0) * 100)}% confidence</span>
                    <span className="text-[10px] text-muted-foreground">{beatGrid.beats?.length ?? 0} beats</span>
                  </div>
                </div>
              )}

              {audioSections && audioSections.length > 0 && (
                <div className="glass-card rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    <Zap size={10} />
                    Sections · {audioSections.length}
                  </div>
                  <div className="space-y-1.5">
                    {audioSections.map((s) => (
                      <div key={s.index} className="flex items-start gap-2">
                        <span className="text-[9px] font-mono text-primary/70 mt-0.5 whitespace-nowrap w-16 shrink-0">
                          {formatTime(s.startSec)}–{formatTime(s.endSec)}
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                          {s.role}
                        </span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="w-12 h-1.5 rounded-full bg-secondary overflow-hidden shrink-0" title={`Energy: ${Math.round(s.avgEnergy * 100)}%`}>
                            <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.round(s.avgEnergy * 100)}%` }} />
                          </div>
                          <span className="text-[8px] text-muted-foreground/60 truncate">
                            {s.spectralCharacter} · {s.beatDensity.toFixed(1)}b/s
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dance buttons */}
          {publishedUrl && !danceNeedsRegeneration ? (
            <div className="flex gap-2">
              <a
                href={publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center text-sm font-semibold tracking-wide uppercase transition-colors border rounded-xl py-3 text-foreground hover:text-primary border-border/40 hover:border-primary/40"
              >
                Watch Dance
              </a>
              <button
                onClick={handleDance}
                disabled={republishDisabled || !danceNeedsRegeneration}
                className="flex-1 flex items-center justify-center text-sm font-semibold tracking-wide uppercase transition-colors border rounded-xl py-3 disabled:opacity-40 disabled:cursor-not-allowed text-foreground hover:text-primary border-border/40 hover:border-primary/40"
              >
                {publishing ? <Loader2 size={14} className="animate-spin" /> : "Republish"}
              </button>
            </div>
          ) : (
            <button
              onClick={handleDance}
              disabled={danceDisabled}
              className="w-full flex items-center justify-center text-sm font-semibold tracking-wide uppercase transition-colors border rounded-xl py-3 disabled:opacity-40 disabled:cursor-not-allowed text-foreground hover:text-primary border-border/40 hover:border-primary/40"
            >
              {publishing ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  <span>{publishStatus || "Publishing…"}</span>
                </span>
              ) : (
                publishedUrl ? "Regenerate Dance" : "Dance"
              )}
            </button>
          )}
        </div>
    </div>
  );
}
