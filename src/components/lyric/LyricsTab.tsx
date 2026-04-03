/**
 * LyricsTab — Upload audio, transcribe, render inline editor.
 * No analysis, no DNA, no cinematic direction.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { BeatGridData } from "@/hooks/useBeatGrid";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUsageQuota } from "@/hooks/useUsageQuota";
import { useAudioProject } from "@/hooks/useAudioProject";
import { compressAudioFile } from "@/lib/compressAudio";
import { sessionAudio } from "@/lib/sessionAudioCache";
import { toast } from "sonner";
import { LyricUploader } from "./LyricUploader";
import { LyricDisplay, type LyricData, type LyricLine } from "./LyricDisplay";
import { LyricSkeleton } from "./LyricSkeleton";
import type { WaveformData } from "@/hooks/useAudioEngine";
import type { ReactNode } from "react";
import { AuthNudge } from "@/components/ui/AuthNudge";
import { persistQueue } from "@/lib/persistQueue";
import { buildPhrases } from "@/lib/phraseEngine";

const MAX_RAW_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_TRANSCRIBE_ATTEMPTS = 2;
const TRANSCRIBE_RETRY_DELAY_MS = 3000;

// ── Transcription fingerprint cache ──────────────────────────────────────────
// Key: hash of file size + name + first 64KB of content
// Value: { lines, words, title, artist, hooks, metadata, _debug }

async function computeAudioFingerprint(file: File): Promise<string> {
  const slice = file.slice(0, 65536);
  const buf = await slice.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // Simple FNV-1a hash — fast, no crypto needed
  let hash = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 16777619);
  }
  return `${file.size}:${file.name}:${(hash >>> 0).toString(36)}`;
}

const TRANSCRIPT_CACHE_KEY = "tfm:transcript_cache";
const TRANSCRIPT_CACHE_MAX = 5; // keep last 5 transcriptions
const TRANSCRIPT_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface TranscriptCacheEntry {
  fingerprint: string;
  result: any;
  ts: number;
}

/** Convert Scribe word timestamps to phrase-engine lines. Falls back to raw segments. */
function wordsToLines(
  words: Array<{ word: string; start: number; end: number }> | null | undefined,
  fallbackLines: LyricLine[],
): LyricLine[] {
  if (!words?.length) return fallbackLines;
  const result = buildPhrases(words);
  if (!result.phrases.length) return fallbackLines;
  return result.phrases.map((p) => ({
    start: p.start,
    end: p.end,
    text: p.text,
    tag: "main" as const,
  }));
}

function readTranscriptCache(): TranscriptCacheEntry[] {
  try {
    return JSON.parse(localStorage.getItem(TRANSCRIPT_CACHE_KEY) || "[]");
  } catch { return []; }
}

function writeTranscriptCache(entries: TranscriptCacheEntry[]): void {
  try {
    localStorage.setItem(TRANSCRIPT_CACHE_KEY, JSON.stringify(entries));
  } catch {}
}

function getCachedTranscript(fingerprint: string): any | null {
  const entries = readTranscriptCache();
  const now = Date.now();
  const entry = entries.find(e => e.fingerprint === fingerprint && now - e.ts < TRANSCRIPT_CACHE_TTL);
  return entry?.result ?? null;
}

function setCachedTranscript(fingerprint: string, result: any): void {
  let entries = readTranscriptCache().filter(e => e.fingerprint !== fingerprint);
  entries.unshift({ fingerprint, result, ts: Date.now() });
  if (entries.length > TRANSCRIPT_CACHE_MAX) entries = entries.slice(0, TRANSCRIPT_CACHE_MAX);
  writeTranscriptCache(entries);
}

export type HeaderProjectSetter = (
  project: {
    title: string;
    onBack: () => void;
    rightContent?: ReactNode;
    onTitleChange?: (newTitle: string) => void;
  } | null,
) => void;

interface Props {
  lyricData: LyricData | null;
  setLyricData: (d: LyricData | null) => void;
  audioFile: File | null;
  setAudioFile: (f: File | null) => void;
  hasRealAudio: boolean;
  setHasRealAudio: (v: boolean) => void;
  savedId: string | null;
  setSavedId: (id: string | null) => void;
  setLines: (lines: LyricLine[]) => void;
  words?: Array<{ word: string; start: number; end: number }> | null;
  fmlyLines: any[] | null;
  setFmlyLines: (l: any[] | null) => void;
  versionMeta: any | null;
  setVersionMeta: (v: any | null) => void;
  beatGrid?: BeatGridData | null;
  setWords?: (w: Array<{ word: string; start: number; end: number }> | null) => void;
  waveformData?: WaveformData | null;
  onProjectSaved?: () => void;
  onNewProject?: () => void;
  onHeaderProject?: HeaderProjectSetter;
  onSavedId?: (id: string) => void;
  sceneInput?: ReactNode;
  onAudioSubmitted?: (file: File) => void;
  onUploadStarted?: (payload: { file: File; projectId: string | null; title: string }) => void;
  onTitleChange?: (newTitle: string) => void;
  spotifyTrackId: string | null;
  setSpotifyTrackId: (id: string | null) => void;
  /** When set, auto-submits this file for transcription on mount. Used by claim pages. */
  autoSubmitFile?: File | null;
}

export function LyricsTab({
  lyricData,
  setLyricData,
  audioFile,
  setAudioFile,
  hasRealAudio,
  setHasRealAudio,
  savedId,
  setSavedId,
  setLines,
  words = null,
  fmlyLines,
  setFmlyLines,
  versionMeta,
  setVersionMeta,
  beatGrid,
  setWords,
  waveformData,
  onProjectSaved,
  onNewProject,
  onHeaderProject,
  onSavedId,
  sceneInput,
  onAudioSubmitted,
  onUploadStarted,
  onTitleChange,
  spotifyTrackId,
  setSpotifyTrackId,
  autoSubmitFile = null,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [debugData, setDebugData] = useState<any | null>(null);
  const [spotifySearchQuery, setSpotifySearchQuery] = useState("");
  const [spotifyResults, setSpotifyResults] = useState<Array<{
    id: string;
    name: string;
    artists: string;
    image: string | null;
    url: string;
  }>>([]);
  const [spotifySearching, setSpotifySearching] = useState(false);
  const spotifyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user } = useAuth();
  const quota = useUsageQuota("lyric");
  const handleSpotifySearch = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSpotifyResults([]);
      return;
    }
    setSpotifySearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("spotify-search", {
        body: { query: query.trim(), type: "track" },
      });
      if (!error && data?.results) {
        setSpotifyResults(data.results.slice(0, 5));
      }
    } catch (e) {
      console.error("[SpotifySearch] failed", e);
    } finally {
      setSpotifySearching(false);
    }
  }, []);

  const onSpotifyQueryChange = useCallback((value: string) => {
    setSpotifySearchQuery(value);
    if (spotifyDebounceRef.current) clearTimeout(spotifyDebounceRef.current);
    spotifyDebounceRef.current = setTimeout(() => handleSpotifySearch(value), 400);
  }, [handleSpotifySearch]);

  const handleSpotifySelect = useCallback(async (track: {
    id: string;
    name: string;
    artists: string;
    image: string | null;
    url: string;
  }) => {
    setSpotifyTrackId(track.id);
    setSpotifySearchQuery(`${track.name} — ${track.artists}`);
    setSpotifyResults([]);

    if (savedId) {
      persistQueue.enqueue({
        table: "saved_lyrics",
        id: savedId,
        payload: {
          spotify_track_id: track.id,
          spotify_track_url: track.url,
        },
      });
    }
  }, [savedId, setSpotifyTrackId]);

  const handleSpotifyClear = useCallback(() => {
    setSpotifyTrackId(null);
    setSpotifySearchQuery("");
    setSpotifyResults([]);

    if (savedId) {
      persistQueue.enqueue({
        table: "saved_lyrics",
        id: savedId,
        payload: {
          spotify_track_id: null,
          spotify_track_url: null,
        },
      });
    }
  }, [savedId, setSpotifyTrackId]);

  const resolveProjectTitle = useCallback(
    (title: string | null | undefined, filename: string) => {
      const normalizedTitle = (title || "").trim();
      if (
        normalizedTitle &&
        normalizedTitle.toLowerCase() !== "unknown" &&
        normalizedTitle.toLowerCase() !== "untitled"
      ) {
        return normalizedTitle;
      }
      return filename.replace(/\.[^/.]+$/, "").trim() || "Untitled";
    },
    [],
  );

  useEffect(() => {
    if (lyricData?.title && !spotifyTrackId && !spotifySearchQuery) {
      setSpotifySearchQuery(lyricData.title);
      void handleSpotifySearch(lyricData.title);
    }
  }, [lyricData?.title, spotifyTrackId, spotifySearchQuery, handleSpotifySearch]);

  useEffect(() => {
    return () => {
      if (spotifyDebounceRef.current) clearTimeout(spotifyDebounceRef.current);
    };
  }, []);
  const { handleFileSelected, showAuthNudge, dismissAuthNudge } = useAudioProject({
    tool: "lyric",
    dbTable: "saved_lyrics",
    buildStubRow: ({ file, userId }) => ({
      user_id: userId,
      title: resolveProjectTitle(null, file.name),
      lines: [],
      words: null,
      filename: file.name,
      updated_at: new Date().toISOString(),
    }),
    getSidebarLabel: (file) => resolveProjectTitle(null, file.name),
    getSidebarRawData: ({ projectId, file, audioUrl }) => ({ id: projectId, title: resolveProjectTitle(null, file.name), lines: [], filename: file.name, audio_url: audioUrl }),
  });

  const handleTranscribe = useCallback(
    async (file: File, referenceLyrics?: string) => {
      console.log("[handleTranscribe] START", { fileName: file.name, canUse: quota.canUse, tier: quota.tier, loading: quota.loading, user: !!user });
      if (!quota.canUse) {
        console.warn("[handleTranscribe] BLOCKED by quota", { tier: quota.tier, used: quota.used, limit: quota.limit });
        toast.error(
          quota.tier === "anonymous"
            ? "Sign up for more uses"
            : "Invite an artist to unlock unlimited",
        );
        return;
      }
      const t0 = performance.now();
      const ms = () => `${(performance.now() - t0).toFixed(0)}ms`;
      setLoading(true);

      const project = await handleFileSelected(file);
      console.log("[handleTranscribe] handleFileSelected result", { projectId: project?.projectId, audioUrl: project?.audioUrl?.slice(0, 60) });
      const projectId = project?.projectId ?? null;
      const storageAudioUrl = project?.audioUrl ?? null;
      const draftTitle = resolveProjectTitle(null, file.name);
      setLyricData({ title: draftTitle, lines: [] });
      setLines([]);
      setAudioFile(file);
      setHasRealAudio(true);
      setSavedId(projectId);
      if (projectId) {
        sessionAudio.set("lyric", projectId, file, { ttlMs: 20 * 60 * 1000 });
      } else {
        sessionAudio.set("lyric", "__unsaved__", file, { ttlMs: 5 * 60 * 1000 });
      }
      onUploadStarted?.({ file, projectId, title: draftTitle });

      // Start beat grid analysis in parallel with transcription
      onAudioSubmitted?.(file);

      let transcribeTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        // Check transcription cache first
        const fingerprint = await computeAudioFingerprint(file);
        // TESTING: bypass cache to force re-transcription every upload
        const cached: any = null; // getCachedTranscript(fingerprint);
        if (cached && cached.lines?.length > 0) {
          // Cache hit — skip the edge function entirely
          const phraseLines = wordsToLines(cached.words, cached.lines);
          const newLyricData: LyricData = {
            title: resolveProjectTitle(cached.title, file.name),
            artist: cached.artist || undefined,
            lines: phraseLines,
            hooks: cached.hooks,
            metadata: cached.metadata,
          };
          setLyricData(newLyricData);
          setLines(phraseLines);
          setWords?.(cached.words ?? null);
          setAudioFile(file);
          setHasRealAudio(true);
          setSavedId(projectId);
          setDebugData(cached._debug ?? null);
          if (cached.spotify_track_id) {
            setSpotifyTrackId(cached.spotify_track_id);
            setSpotifySearchQuery(cached.title || "");
          }

          if (projectId) {
            sessionAudio.set("lyric", projectId, file, { ttlMs: 20 * 60 * 1000 });
            onSavedId?.(projectId);
            onProjectSaved?.();
            persistQueue.enqueue({
              table: "saved_lyrics",
              id: projectId,
              payload: {
                user_id: user?.id,
                title: resolveProjectTitle(cached.title, file.name),
                lines: phraseLines,
                words: cached.words ?? null,
                filename: file.name,
              },
            });
          } else {
            sessionAudio.set("lyric", "__unsaved__", file, { ttlMs: 5 * 60 * 1000 });
          }
          await quota.increment();
          setLoading(false);
          return;
        }

        // Only compress if over 25MB (only needed for fallback multipart path)

        let uploadFile: File;
        if (file.size > MAX_RAW_UPLOAD_BYTES) {
          try {
            const ct0 = performance.now();
            uploadFile = await compressAudioFile(file);
          } catch (compErr) {
            toast.error(compErr instanceof Error ? compErr.message : "Compression failed");
            setLoading(false);
            return;
          }
        } else {
          
          uploadFile = file;
        }

        const transcribeAbort = new AbortController();
        transcribeTimeout = setTimeout(() => transcribeAbort.abort(), 120_000); // 2 min for large files

        let response: Response | null = null;
        for (let attempt = 1; attempt <= MAX_TRANSCRIBE_ATTEMPTS; attempt++) {
          if (storageAudioUrl) {
            response = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lyric-transcribe`,
              {
                method: "POST",
                headers: {
                  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  audioUrl: storageAudioUrl,
                  format: uploadFile.name.split(".").pop()?.toLowerCase() || "webm",
                  ...(referenceLyrics?.trim()
                    ? { referenceLyrics: referenceLyrics.trim() }
                    : {}),
                }),
                signal: transcribeAbort.signal,
              },
            );
          } else {
            const formData = new FormData();
            formData.append("audio", uploadFile, uploadFile.name);
            if (referenceLyrics?.trim()) formData.append("referenceLyrics", referenceLyrics.trim());
            response = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lyric-transcribe`,
              {
                method: "POST",
                headers: {
                  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                },
                body: formData,
                signal: transcribeAbort.signal,
              },
            );
          }
          if (response.ok || response.status < 500 || attempt === MAX_TRANSCRIBE_ATTEMPTS) break;
          await new Promise((resolve) => setTimeout(resolve, TRANSCRIBE_RETRY_DELAY_MS));
        }
        if (!response) throw new Error("Transcription response was empty");


        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Transcription failed" }));
          throw new Error(err.error || `Error ${response.status}`);
        }

        const data = await response.json();
        clearTimeout(transcribeTimeout);
        console.log("[handleTranscribe] response OK", { linesCount: data.lines?.length, wordsCount: data.words?.length, error: data.error });

        if (data.error) throw new Error(data.error);
        if (!data.lines) throw new Error("Invalid response format");
        const phraseLines = wordsToLines(data.words, data.lines);

        if (user && projectId) {
          // Non-blocking — don't let DB persist block the UI
          persistQueue.enqueue({
            table: "saved_lyrics",
            id: projectId,
            payload: {
              user_id: user.id,
              title: resolveProjectTitle(data.title, file.name),
              lines: phraseLines,
              words: data.words ?? null,
              filename: file.name,
            },
          });
        }
        const newLyricData: LyricData = {
          title: resolveProjectTitle(data.title, file.name),
          artist: data.artist || undefined,
          lines: phraseLines,
          hooks: data.hooks,
          metadata: data.metadata,
        };
        setLyricData(newLyricData);
        setLines(phraseLines);
        setWords?.(data.words ?? null);
        setAudioFile(file);
        setHasRealAudio(true);
        setSavedId(projectId);
        setDebugData(data._debug ?? null);
        if (data.spotify_track_id) {
          setSpotifyTrackId(data.spotify_track_id);
          setSpotifySearchQuery(data.title || "");
        }

        // Cache the transcription for re-uploads of the same file
        setCachedTranscript(fingerprint, {
          lines: phraseLines,
          words: data.words ?? null,
          title: data.title,
          artist: data.artist,
          hooks: data.hooks,
          metadata: data.metadata,
          _debug: data._debug,
        });

        if (projectId) {
          sessionAudio.set("lyric", projectId, file, { ttlMs: 20 * 60 * 1000 });
          onSavedId?.(projectId);
          onProjectSaved?.();
        } else {
          sessionAudio.set("lyric", "__unsaved__", file, { ttlMs: 5 * 60 * 1000 });
        }
        await quota.increment();
      } catch (e) {
        console.error("[handleTranscribe] FAILED", e);
        clearTimeout(transcribeTimeout);
        if (projectId) {
          await supabase.from("saved_lyrics").delete().eq("id", projectId);
        }
        setLyricData(null);
        setLines([]);
        setAudioFile(null);
        setHasRealAudio(false);
        setSavedId(null);
        const msg = e instanceof Error
          ? (e.name === "AbortError" ? "Transcription timed out — try a shorter file or try again" : e.message)
          : "Failed to transcribe lyrics";
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [quota, handleFileSelected, user, onSavedId, onProjectSaved, resolveProjectTitle, setLyricData, setLines, setAudioFile, setHasRealAudio, setSavedId, onAudioSubmitted, onUploadStarted, setSpotifyTrackId],
  );

  // ── Auto-submit for claim pages ──────────────────────────────────────
  const autoSubmitProcessed = useRef(false);
  useEffect(() => {
    console.log("[LyricsTab] autoSubmit effect", { hasFile: !!autoSubmitFile, processed: autoSubmitProcessed.current });
    if (!autoSubmitFile || autoSubmitProcessed.current) return;
    autoSubmitProcessed.current = true;
    console.log("[LyricsTab] autoSubmit → calling handleTranscribe");
    handleTranscribe(autoSubmitFile);
  }, [autoSubmitFile, handleTranscribe]);

  const handleBack = useCallback(() => {
    setLyricData(null);
    setAudioFile(null);
    setHasRealAudio(false);
    setSavedId(null);
    setFmlyLines(null);
    setVersionMeta(null);
    setDebugData(null);
    setSpotifyTrackId(null);
    setSpotifySearchQuery("");
    setSpotifyResults([]);
    onNewProject?.();
  }, [onNewProject, setLyricData, setAudioFile, setHasRealAudio, setSavedId, setFmlyLines, setVersionMeta, setSpotifyTrackId]);

  // State A: lines loaded → full editor
  if (lyricData && audioFile && lyricData.lines.length > 0) {
    return (
      <div className="flex-1 px-4 py-6 space-y-3">
        <div style={{
          padding: "8px 0",
          borderBottom: "0.5px solid rgba(255,255,255,0.06)",
          marginBottom: 8,
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
          }}>
            <svg viewBox="0 0 24 24" width="14" height="14" style={{ flexShrink: 0 }}>
              <path fill="rgba(30,215,96,0.6)" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02z" />
            </svg>
            <span style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.3)",
              fontFamily: "monospace",
              letterSpacing: "0.05em",
            }}>
              {spotifyTrackId ? "Linked to Spotify" : "Link to Spotify (optional)"}
            </span>
          </div>
          {spotifyTrackId ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              background: "rgba(30,215,96,0.06)",
              border: "0.5px solid rgba(30,215,96,0.12)",
              borderRadius: 8,
            }}>
              <span style={{
                flex: 1,
                fontSize: 12,
                color: "rgba(255,255,255,0.6)",
                fontFamily: "monospace",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {spotifySearchQuery}
              </span>
              <button
                onClick={handleSpotifyClear}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.25)",
                  cursor: "pointer",
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 2,
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={spotifySearchQuery}
                onChange={(e) => onSpotifyQueryChange(e.target.value)}
                placeholder="Search for your song on Spotify..."
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "rgba(255,255,255,0.03)",
                  border: "0.5px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  fontSize: 12,
                  fontFamily: "monospace",
                  color: "rgba(255,255,255,0.6)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {spotifyResults.length > 0 && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  left: 0, right: 0,
                  zIndex: 50,
                  background: "#1a1a1f",
                  border: "0.5px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  marginTop: 4,
                  overflow: "hidden",
                  maxHeight: 240,
                  overflowY: "auto",
                }}>
                  {spotifyResults.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => void handleSpotifySelect(track)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 10px",
                        background: "transparent",
                        border: "none",
                        borderBottom: "0.5px solid rgba(255,255,255,0.04)",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      {track.image && (
                        <img
                          src={track.image}
                          alt=""
                          style={{
                            width: 32, height: 32, borderRadius: 4,
                            objectFit: "cover", flexShrink: 0,
                          }}
                        />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.7)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {track.name}
                        </div>
                        <div style={{
                          fontSize: 10,
                          color: "rgba(255,255,255,0.3)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {track.artists}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {spotifySearching && (
                <div style={{ fontSize: 10, marginTop: 4, color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}>
                  Searching Spotify…
                </div>
              )}
            </div>
          )}
        </div>
        <LyricDisplay
          data={lyricData}
          audioFile={audioFile}
          words={words}
          hasRealAudio={hasRealAudio}
          savedId={savedId}
          initialBeatGrid={beatGrid}
          initialWaveform={waveformData}
          fmlyLines={fmlyLines}
          versionMeta={versionMeta}
          
          onBack={handleBack}
          onSaved={(id) => {
            setSavedId(id);
            if (audioFile && hasRealAudio) sessionAudio.set("lyric", id, audioFile, { ttlMs: 20 * 60 * 1000 });
            sessionAudio.remove("lyric", "__unsaved__");
            onProjectSaved?.();
            onSavedId?.(id);
          }}
          onReuploadAudio={(file) => {
            setAudioFile(file);
            setHasRealAudio(true);
            const cacheId = savedId || "__unsaved__";
            sessionAudio.set("lyric", cacheId, file, { ttlMs: cacheId === "__unsaved__" ? 5 * 60 * 1000 : 20 * 60 * 1000 });
          }}
          onLinesChange={(newLines) => {
            setLines(newLines);
            if (lyricData) setLyricData({ ...lyricData, lines: newLines });
          }}
          onHeaderProject={onHeaderProject}
          onTitleChange={onTitleChange}
          debugData={debugData}
        />
      </div>
    );
  }

  // State B & C: shell exists but no lines yet → skeleton
  if (lyricData && audioFile) {
    return (
      <div className="flex-1 px-4 py-6">
        <LyricSkeleton
          title={lyricData.title}
          fileName={audioFile.name}
          loading={loading}
          waveformData={waveformData}
          onRetry={() => handleTranscribe(audioFile)}
          onBack={handleBack}
        />
      </div>
    );
  }

  // State C.5: lyricData has lines but audioFile not yet hydrated — avoid uploader flash
  if (lyricData && lyricData.lines.length > 0) {
    return (
      <div className="flex-1 px-4 py-6">
        <LyricSkeleton
          title={lyricData.title}
          fileName=""
          loading={true}
          waveformData={null}
          onRetry={() => {}}
          onBack={() => {}}
        />
      </div>
    );
  }

  // State D: nothing yet → uploader
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 overflow-y-auto">
      {showAuthNudge ? <div className="w-full max-w-3xl mb-3"><AuthNudge onDismiss={dismissAuthNudge} /></div> : null}
      <LyricUploader
        onTranscribe={handleTranscribe}
        loading={loading}
        loadingMsg="Syncing..."
        sceneInput={sceneInput}
      />
    </div>
  );
}
