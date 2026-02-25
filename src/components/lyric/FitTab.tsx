/**
 * FitTab — Displays analysis results with waveform + beat markers.
 * Centered single-column layout for readability.
 * Pipeline runs in LyricFitTab parent.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Loader2, Film, RefreshCw, Music, Sparkles, Eye, Palette, Zap } from "lucide-react";
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

  // ── Dance publish handler ─────────────────────────────────────────────
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

  const allReady =
    generationStatus.beatGrid === "done" &&
    generationStatus.songDna === "done" &&
    generationStatus.cinematicDirection === "done";
  const hasErrors = Object.values(generationStatus).includes("error");
  const danceDisabled = !sceneManifest || publishing || !allReady;
  // Republish only needs auth + not currently publishing (data already exists on server)
  const republishDisabled = publishing;

  console.log("[FitTab] allReady:", allReady, "sceneManifest:", !!sceneManifest, "generationStatus:", generationStatus, "publishedUrl:", publishedUrl, "danceNeedsRegeneration:", danceNeedsRegeneration);

  // ── Sections derived from songDna ─────────────────────────────────────
  const physicsSpec = songDna?.physicsSpec;
  const meaning = songDna?.meaning;

  // ── Active line tracking for lyrics scroll ────────────────────────────
  const activeLineIdx = useMemo(() => {
    if (!lyricData?.lines) return -1;
    const ml = lyricData.lines.filter(l => l.tag !== "adlib");
    for (let i = ml.length - 1; i >= 0; i--) {
      if (currentTime >= ml[i].start) return i;
    }
    return -1;
  }, [lyricData?.lines, currentTime]);

  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeLineRef.current && lyricsContainerRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeLineIdx]);

  const mainLines = useMemo(() => lyricData?.lines?.filter(l => l.tag !== "adlib") ?? [], [lyricData?.lines]);

  return (
    <div className="flex-1 px-4 py-6 space-y-4">
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

      {/* Two-column split: lyrics left, report/export right */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* LEFT — Lyrics */}
        <div
          ref={lyricsContainerRef}
          className="glass-card rounded-xl p-4 max-h-[60vh] overflow-y-auto space-y-0.5 scrollbar-thin"
        >
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">Lyrics</p>
          {mainLines.map((line, i) => {
            const isActive = i === activeLineIdx;
            return (
              <div
                key={i}
                ref={isActive ? activeLineRef : undefined}
                className={`py-1 px-2 rounded cursor-pointer text-sm leading-relaxed transition-colors ${
                  isActive
                    ? "bg-primary/10 text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
                onClick={() => handleSeek(line.start)}
              >
                <span className="text-[9px] font-mono text-muted-foreground/50 mr-2 select-none">
                  {Math.floor(line.start / 60)}:{Math.floor(line.start % 60).toString().padStart(2, "0")}
                </span>
                {line.text}
              </div>
            );
          })}
        </div>

        {/* RIGHT — Report + Export */}
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
                <div className="glass-card rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    <Eye size={10} />
                    Cinematic Direction
                  </div>
                  {cinematicDirection.thesis && (
                    <p className="text-xs text-muted-foreground italic leading-relaxed">{cinematicDirection.thesis}</p>
                  )}
                  {cinematicDirection.tensionCurve && Array.isArray(cinematicDirection.tensionCurve) && (
                    <div className="flex items-end gap-px h-8">
                      {cinematicDirection.tensionCurve.map((t: any, i: number) => (
                        <div
                          key={i}
                          className="flex-1 bg-primary/40 rounded-t-sm"
                          style={{ height: `${(t.motionIntensity ?? t.tension ?? t.value ?? 0.5) * 100}%` }}
                          title={t.stage || `${i}`}
                        />
                      ))}
                    </div>
                  )}
                  {cinematicDirection.chapters && Array.isArray(cinematicDirection.chapters) && (
                    <div className="space-y-1">
                      {cinematicDirection.chapters.slice(0, 4).map((ch: any, i: number) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-[9px] font-mono text-primary/70 mt-0.5 whitespace-nowrap">{ch.title || `Ch ${i + 1}`}</span>
                          <p className="text-[10px] text-muted-foreground leading-tight">{ch.emotionalArc || ch.description || ch.mood || ""}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {cinematicDirection.storyboard && Array.isArray(cinematicDirection.storyboard) && (
                    <p className="text-[9px] text-muted-foreground/60">{cinematicDirection.storyboard.length} storyboard frames</p>
                  )}
                </div>
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
            </div>
          )}

          {/* Dance buttons */}
          {publishedUrl && !danceNeedsRegeneration ? (
            <div className="flex gap-2">
              <a
                href={publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold tracking-wide uppercase transition-colors border rounded-xl py-3 text-foreground hover:text-primary border-border/40 hover:border-primary/40"
              >
                <Film size={14} />
                Watch Dance
              </a>
              <button
                onClick={handleDance}
                disabled={republishDisabled}
                className="flex items-center justify-center gap-2 text-sm font-semibold tracking-wide uppercase transition-colors border rounded-xl py-3 px-4 disabled:opacity-40 disabled:cursor-not-allowed text-foreground hover:text-primary border-border/40 hover:border-primary/40"
              >
                {publishing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Republish
              </button>
            </div>
          ) : (
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
                  {publishedUrl ? "Regenerate Dance" : "Dance"}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
