/**
 * FitTab — Auto-triggers beat analysis + lyric-analyze on entry.
 * Shows waveform with lazy beat markers at top.
 * Unlocks Dance button when sceneManifest exists.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Film } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { slugify } from "@/lib/slugify";
import { Progress } from "@/components/ui/progress";
import { useBeatGrid, type BeatGridData } from "@/hooks/useBeatGrid";
import { songSignatureAnalyzer, type SongSignature } from "@/lib/songSignatureAnalyzer";
import { safeManifest } from "@/engine/validateManifest";
import { buildManifestFromDna } from "@/engine/buildManifestFromDna";
import { LyricWaveform } from "./LyricWaveform";
import type { WaveformData } from "@/hooks/useAudioEngine";
import type { LyricLine, LyricData } from "./LyricDisplay";
import type { SceneManifest as FullSceneManifest } from "@/engine/SceneManifest";

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
}

type FitStage = "idle" | "syncing" | "analyzing_beats" | "analyzing_dna" | "generating_direction" | "ready" | "publishing";

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
}: Props) {
  const { user } = useAuth();
  const [stage, setStage] = useState<FitStage>("idle");
  const [progress, setProgress] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState("");
  const triggered = useRef(false);

  // ── Audio playback + waveform ─────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const [waveform, setWaveform] = useState<WaveformData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);

  // Decode audio → waveform + buffer for beat detection
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const { beatGrid: detectedGrid } = useBeatGrid(beatGrid ? null : audioBuffer);

  // Store detected beat grid
  useEffect(() => {
    if (detectedGrid && !beatGrid) {
      setBeatGrid(detectedGrid);
    }
  }, [detectedGrid, beatGrid, setBeatGrid]);

  // Setup audio element + decode waveform
  useEffect(() => {
    if (!audioFile || audioFile.size === 0) return;

    const url = URL.createObjectURL(audioFile);
    audioUrlRef.current = url;

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

    // Decode for waveform peaks
    const ctx = new AudioContext();
    audioFile.arrayBuffer().then((ab) => {
      ctx.decodeAudioData(ab).then((buf) => {
        setAudioBuffer(buf);
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

  // Playback RAF for smooth playhead
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
    if (audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, []);

  // Auto-trigger analysis on tab entry
  useEffect(() => {
    if (triggered.current) return;
    if (!lyricData?.lines?.length || !audioFile) return;
    triggered.current = true;

    void runAnalysis();
  }, [lyricData, audioFile]);

  const runAnalysis = async () => {
    setStage("syncing");
    setProgress(5);

    // 1. Sync/refresh transcript from saved_lyrics if we have a saved ID
    let freshLines = lyricData.lines;
    if (savedId && user) {
      try {
        const { data: saved } = await supabase
          .from("saved_lyrics")
          .select("lines")
          .eq("id", savedId)
          .single();
        if (saved?.lines && Array.isArray(saved.lines)) {
          freshLines = saved.lines as unknown as LyricLine[];
        }
      } catch {}
    }

    setProgress(10);
    setStage("analyzing_beats");

    // 2. Parallel: beat analysis + lyric-analyze
    const beatPromise = (async () => {
      if (beatGrid) return beatGrid;
      if (!hasRealAudio || audioFile.size === 0) return null;
      try {
        // audioBuffer is already being decoded in the effect above
        // Wait for useBeatGrid to detect — poll
        return new Promise<BeatGridData | null>((resolve) => {
          setTimeout(() => resolve(null), 8000);
        });
      } catch (e) {
        console.warn("[FitTab] Beat analysis failed:", e);
        return null;
      }
    })();

    setStage("analyzing_dna");
    setProgress(25);

    const lyricsText = freshLines
      .filter((l: any) => l.tag !== "adlib")
      .map((l: any) => l.text)
      .join("\n");

    // Encode audio for DNA analysis
    let audioBase64: string | undefined;
    let format: string | undefined;
    if (hasRealAudio && audioFile.size > 0) {
      try {
        const arrayBuffer = await audioFile.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < uint8.length; i += chunkSize) {
          binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
        }
        audioBase64 = btoa(binary);
        const name = audioFile.name.toLowerCase();
        if (name.endsWith(".wav")) format = "wav";
        else if (name.endsWith(".m4a")) format = "m4a";
        else if (name.endsWith(".flac")) format = "flac";
        else if (name.endsWith(".ogg")) format = "ogg";
        else if (name.endsWith(".webm")) format = "webm";
        else format = "mp3";
      } catch {}
    }

    const dnaPromise = supabase.functions.invoke("lyric-analyze", {
      body: {
        title: lyricData.title,
        artist: lyricData.artist,
        lyrics: lyricsText,
        audioBase64,
        format,
        beatGrid: beatGrid ? { bpm: beatGrid.bpm, confidence: beatGrid.confidence } : undefined,
        includeHooks: true,
      },
    });

    setProgress(40);

    // Wait for both
    const [, dnaResult] = await Promise.all([beatPromise, dnaPromise]);

    setProgress(60);

    if (dnaResult.error) {
      console.error("[FitTab] lyric-analyze error:", dnaResult.error);
      toast.error("Song DNA analysis failed");
      setStage("idle");
      return;
    }

    const result = dnaResult.data;
    // Parse hooks
    const rawHooks = Array.isArray(result?.hottest_hooks)
      ? result.hottest_hooks
      : result?.hottest_hook
        ? [result.hottest_hook]
        : [];

    const parseHook = (raw: any) => {
      if (!raw?.start_sec) return null;
      const startSec = Number(raw.start_sec);
      const durationSec = Number(raw.duration_sec) || 10;
      const conf = Number(raw.confidence) || 0;
      if (conf < 0.5) return null;
      return {
        hook: { start: startSec, end: startSec + durationSec, score: Math.round(conf * 100), reasonCodes: [], previewText: "", status: conf >= 0.75 ? "confirmed" : "candidate" },
        justification: raw.justification,
        label: raw.label,
      };
    };

    const parsedHooks = rawHooks.map(parseHook).filter(Boolean);
    const primary = parsedHooks[0] || null;
    const secondary = parsedHooks[1] || null;

    const nextSongDna = {
      mood: result?.mood,
      description: result?.description,
      meaning: result?.meaning,
      hook: primary?.hook || null,
      secondHook: secondary?.hook || null,
      hookJustification: primary?.justification,
      secondHookJustification: secondary?.justification,
      hookLabel: primary?.label,
      secondHookLabel: secondary?.label,
      physicsSpec: result?.physics_spec || null,
      scene_manifest: result?.scene_manifest || result?.sceneManifest || null,
    };

    setSongDna(nextSongDna);

    // Build manifest from DNA
    const builtManifest = buildManifestFromDna(nextSongDna as Record<string, unknown>);
    if (builtManifest) {
      const validated = safeManifest(builtManifest).manifest;
      setSceneManifest(validated);
    } else if (nextSongDna.scene_manifest) {
      setSceneManifest(safeManifest(nextSongDna.scene_manifest).manifest);
    }

    setProgress(70);
    setStage("generating_direction");

    // 3. Auto-call cinematic-direction
    try {
      const lyricsForDirection = freshLines
        .filter((l: any) => l.tag !== "adlib")
        .map((l: any) => ({ text: l.text, start: l.start, end: l.end }));

      const { data: dirResult } = await supabase.functions.invoke("cinematic-direction", {
        body: {
          title: lyricData.title,
          artist: lyricData.artist,
          lines: lyricsForDirection,
          beatGrid: beatGrid ? { bpm: beatGrid.bpm } : undefined,
          lyricId: savedId || undefined,
        },
      });

      if (dirResult?.cinematicDirection) {
        setCinematicDirection(dirResult.cinematicDirection);
        setSongDna((prev: any) => prev ? { ...prev, cinematic_direction: dirResult.cinematicDirection } : prev);
      }
    } catch (e) {
      console.warn("[FitTab] cinematic direction failed:", e);
    }

    setProgress(100);
    setStage("ready");
  };

  // Dance button handler
  const handleDance = useCallback(async () => {
    if (!user || !sceneManifest || !lyricData || !audioFile || publishing) return;
    setPublishing(true);
    setStage("publishing");
    setPublishStatus("Preparing…");

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      const displayName = profile?.display_name || lyricData.artist || "artist";
      const artistSlug = slugify(displayName);
      const songSlug = slugify(lyricData.title || "untitled");

      if (!artistSlug || !songSlug) {
        toast.error("Couldn't generate a valid URL — check song/artist name");
        setPublishing(false);
        setStage("ready");
        return;
      }

      // 1. Generate background image
      setPublishStatus("Generating background…");
      let backgroundUrl: string | null = null;
      try {
        const { data: bgResult } = await supabase.functions.invoke("lyric-video-bg", {
          body: { manifest: sceneManifest, userDirection: `Song: ${lyricData.title} by ${lyricData.artist}` },
        });
        backgroundUrl = bgResult?.imageUrl ?? null;
        setBgImageUrl(backgroundUrl);
      } catch {}

      // 2. Upload audio
      setPublishStatus("Uploading audio…");
      const fileExt = audioFile.name.split(".").pop() || "webm";
      const storagePath = `${user.id}/${artistSlug}/${songSlug}/lyric-dance.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("audio-clips")
        .upload(storagePath, audioFile, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("audio-clips").getPublicUrl(storagePath);
      const audioUrl = urlData.publicUrl;

      // 3. Upsert shareable_lyric_dances
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
        }, { onConflict: "artist_slug,song_slug" });

      if (insertError) throw insertError;

      // 4. Redirect
      const url = `/${artistSlug}/${songSlug}/lyric-dance`;
      toast.success("Lyric Dance page published!");
      window.location.href = url;
    } catch (e: any) {
      console.error("Dance publish error:", e);
      toast.error(e.message || "Failed to publish lyric dance");
    } finally {
      setPublishing(false);
      setPublishStatus("");
    }
  }, [user, sceneManifest, lyricData, audioFile, publishing, songDna, beatGrid, cinematicDirection, setBgImageUrl]);

  const stageLabel = {
    idle: "Waiting…",
    syncing: "Syncing transcript…",
    analyzing_beats: "Analyzing rhythm…",
    analyzing_dna: "Generating Song DNA…",
    generating_direction: "Creating cinematic direction…",
    ready: "Ready",
    publishing: publishStatus || "Publishing…",
  };

  const danceDisabled = !sceneManifest || publishing;

  return (
    <div className="flex-1 px-4 py-6 space-y-6">
      {/* ── Waveform with lazy beat markers ── */}
      <LyricWaveform
        waveform={waveform}
        isPlaying={isPlaying}
        currentTime={currentTime}
        onSeek={handleSeek}
        onTogglePlay={handleTogglePlay}
        beats={beatGrid?.beats ?? null}
        beatGridLoading={!beatGrid && stage !== "ready" && stage !== "idle"}
      />

      {/* Progress section */}
      {stage !== "ready" && stage !== "idle" && !publishing && (
        <div className="glass-card rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">{stageLabel[stage]}</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      )}

      {/* Ready state — Song DNA summary */}
      {stage === "ready" && songDna && (
        <div className="glass-card rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Song DNA</span>
          </div>
          {songDna.description && (
            <p className="text-sm text-muted-foreground italic leading-relaxed">{songDna.description}</p>
          )}
          {songDna.mood && (
            <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {songDna.mood}
            </span>
          )}
          {songDna.meaning?.theme && (
            <p className="text-sm font-semibold text-foreground">{songDna.meaning.theme}</p>
          )}
        </div>
      )}

      {/* Dance button */}
      <button
        onClick={handleDance}
        disabled={danceDisabled}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold tracking-wide uppercase transition-colors border rounded-xl py-3 disabled:opacity-40 disabled:cursor-not-allowed text-foreground hover:text-primary border-border/40 hover:border-primary/40"
      >
        {publishing ? (
          <span className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            <span>{publishStatus || "Publishing…"}</span>
          </span>
        ) : (
          <>
            <Film size={14} />
            Dance
          </>
        )}
      </button>

      {!sceneManifest && stage === "ready" && (
        <p className="text-[10px] text-muted-foreground text-center">
          Scene manifest could not be generated. Try re-analyzing.
        </p>
      )}
    </div>
  );
}
