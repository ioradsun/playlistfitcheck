import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUsageQuota } from "@/hooks/useUsageQuota";
import { compressAudioFile } from "@/lib/compressAudio";
import { sessionAudio } from "@/lib/sessionAudioCache";
import { toast } from "sonner";
import { LyricUploader } from "./LyricUploader";
import { LyricDisplay, type LyricData } from "./LyricDisplay";
import { LyricProgressModal, type ProgressStage } from "./LyricProgressModal";
import { useBeatGrid, type BeatGridData } from "@/hooks/useBeatGrid";

import type { ReactNode } from "react";

export type HeaderProjectSetter = (project: { title: string; onBack: () => void; rightContent?: ReactNode } | null) => void;

interface Props {
  initialLyric?: any;
  onProjectSaved?: () => void;
  onNewProject?: () => void;
  onHeaderProject?: HeaderProjectSetter;
  onSavedId?: (id: string) => void;
}

export function LyricFitTab({ initialLyric, onProjectSaved, onNewProject, onHeaderProject, onSavedId }: Props) {
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Syncing...");
  const [progressStage, setProgressStage] = useState<ProgressStage>("compressing");
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressFileName, setProgressFileName] = useState<string>("");
  const [lyricData, setLyricData] = useState<LyricData | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [hasRealAudio, setHasRealAudio] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [fmlyLines, setFmlyLines] = useState<any[] | null>(null);
  const [versionMeta, setVersionMeta] = useState<any | null>(null);
  const [debugData, setDebugData] = useState<any | null>(null);
  const [savedSongDna, setSavedSongDna] = useState<any | null>(null);
  const [analysisModel, setAnalysisModel] = useState("google/gemini-2.5-flash");
  const [transcriptionModel, setTranscriptionModel] = useState("scribe");
  const { user } = useAuth();
  const quota = useUsageQuota("lyric");

  const resolveProjectTitle = useCallback((title: string | null | undefined, filename: string) => {
    const normalizedTitle = (title || "").trim();
    if (normalizedTitle && normalizedTitle.toLowerCase() !== "unknown" && normalizedTitle.toLowerCase() !== "untitled") {
      return normalizedTitle;
    }
    return filename.replace(/\.[^/.]+$/, "").trim() || "Untitled";
  }, []);

  // Beat grid: decode audio early and run in parallel with transcription
  const [earlyAudioBuffer, setEarlyAudioBuffer] = useState<AudioBuffer | null>(null);
  const [precomputedBeatGrid, setPrecomputedBeatGrid] = useState<BeatGridData | null>(null);
  const { beatGrid: detectedGrid } = useBeatGrid(earlyAudioBuffer);

  // When beat grid detection finishes, store it
  useEffect(() => {
    if (detectedGrid) setPrecomputedBeatGrid(detectedGrid);
  }, [detectedGrid]);

  // Load saved lyric from dashboard navigation
  useEffect(() => {
    if (initialLyric && !lyricData) {
      const filename = initialLyric.filename || "saved-lyrics.mp3";
      setLyricData({
        title: resolveProjectTitle(initialLyric.title, filename),
        artist: initialLyric.artist,
        lines: initialLyric.lines as any[],
      });
      setSavedId(initialLyric.id);
      setFmlyLines((initialLyric as any).fmly_lines ?? null);
      setVersionMeta((initialLyric as any).version_meta ?? null);
      setSavedSongDna((initialLyric as any).song_dna ?? null);
      // Restore saved beat grid
      const savedBg = (initialLyric as any).beat_grid;
      if (savedBg) setPrecomputedBeatGrid(savedBg as BeatGridData);

      // Check session cache for real audio first
      const cachedAudio = initialLyric.id ? sessionAudio.get("lyric", initialLyric.id) : undefined;
      if (cachedAudio) {
        setAudioFile(cachedAudio);
        setHasRealAudio(true);
      } else if ((initialLyric as any).audio_url) {
        // Fetch audio from stored URL
        const audioUrl = (initialLyric as any).audio_url as string;
        fetch(audioUrl)
          .then(res => res.blob())
          .then(blob => {
            const file = new File([blob], filename, { type: blob.type || "audio/mpeg" });
            setAudioFile(file);
            setHasRealAudio(true);
            // Cache for future navigations
            if (initialLyric.id) sessionAudio.set("lyric", initialLyric.id, file);
          })
          .catch(() => {
            const dummyFile = new File([], filename, { type: "audio/mpeg" });
            setAudioFile(dummyFile);
            setHasRealAudio(false);
          });
      } else {
        const dummyFile = new File([], filename, { type: "audio/mpeg" });
        setAudioFile(dummyFile);
        setHasRealAudio(false);
      }
    }
  }, [initialLyric, lyricData, resolveProjectTitle]);

  // Read pipeline model config from site_copy
  useEffect(() => {
    supabase.from("site_copy").select("copy_json").limit(1).single().then(({ data }) => {
      const f = (data?.copy_json as any)?.features || {};
      if (f.lyric_analysis_model) setAnalysisModel(f.lyric_analysis_model);
      if (f.lyric_transcription_model) setTranscriptionModel(f.lyric_transcription_model);
    });
  }, []);

  const uploadAudioImmediately = useCallback(async (file: File, userId: string, projectId: string): Promise<string | null> => {
    const ext = file.name.split(".").pop() ?? "mp3";
    const path = `${userId}/lyric/${projectId}.${ext}`;

    const { error } = await supabase.storage
      .from("audio-clips")
      .upload(path, file, { upsert: true });

    if (error) return null;

    const { data } = supabase.storage
      .from("audio-clips")
      .getPublicUrl(path);

    return data.publicUrl;
  }, []);

  const handleTranscribe = useCallback(async (file: File, referenceLyrics?: string) => {
    if (!quota.canUse) {
      toast.error(quota.tier === "anonymous" ? "Sign up for more uses" : "Invite an artist to unlock unlimited");
      return;
    }
    setLoading(true);
    setProgressFileName(file.name);
    setProgressStage("compressing");
    setProgressOpen(true);

    // Kick off beat grid detection in parallel (decode original file)
    setPrecomputedBeatGrid(null);
    setEarlyAudioBuffer(null);
    const audioCtx = new AudioContext();
    file.arrayBuffer().then(ab => audioCtx.decodeAudioData(ab)).then(buf => {
      setEarlyAudioBuffer(buf);
    }).catch(err => console.warn("[beat-grid] Early decode failed:", err));

    try {
      // Stage 1: Compress
      setProgressStage("compressing");
      let uploadFile: File;
      try {
        uploadFile = await compressAudioFile(file);
      } catch (compErr) {
        toast.error(compErr instanceof Error ? compErr.message : "Compression failed");
        setLoading(false);
        setProgressOpen(false);
        return;
      }

      // Stage 2: Encode
      setProgressStage("encoding");
      const arrayBuffer = await uploadFile.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < uint8.length; i += chunkSize) {
        binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
      }
      const audioBase64 = btoa(binary);

      const name = uploadFile.name.toLowerCase();
      const mime = (uploadFile.type || "").toLowerCase();
      let format: string;
      if (name.endsWith(".wav") || mime.includes("wav")) format = "wav";
      else if (name.endsWith(".m4a") || mime.includes("m4a") || (mime.includes("mp4") && !name.endsWith(".mp4"))) format = "m4a";
      else if (name.endsWith(".mp4") || mime.includes("mp4")) format = "mp4";
      else if (name.endsWith(".flac") || mime.includes("flac")) format = "flac";
      else if (name.endsWith(".ogg") || mime.includes("ogg")) format = "ogg";
      else if (name.endsWith(".webm") || mime.includes("webm")) format = "webm";
      else format = "mp3";

      // Stage 3: Upload
      setProgressStage("uploading");
      const uploadTimers: ReturnType<typeof setTimeout>[] = [];
      uploadTimers.push(setTimeout(() => setProgressStage("buffering"), 3000));
      uploadTimers.push(setTimeout(() => setProgressStage("transmitting"), 6000));
      uploadTimers.push(setTimeout(() => setProgressStage("handshaking"), 9000));

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lyric-transcribe`,
        {
          method: "POST",
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ audioBase64, format, analysisModel, transcriptionModel, referenceLyrics }),
        }
      );

      uploadTimers.forEach(clearTimeout);

      setProgressStage("receiving");
      const timers: ReturnType<typeof setTimeout>[] = [];
      timers.push(setTimeout(() => setProgressStage("transcribing"), 3000));
      timers.push(setTimeout(() => setProgressStage("separating"), 7000));
      timers.push(setTimeout(() => setProgressStage("analyzing"), 11000));
      timers.push(setTimeout(() => setProgressStage("detecting_hook"), 15000));
      timers.push(setTimeout(() => setProgressStage("aligning"), 19000));
      timers.push(setTimeout(() => setProgressStage("finalizing"), 23000));

      if (!response.ok) {
        timers.forEach(clearTimeout);
        const err = await response.json().catch(() => ({ error: "Transcription failed" }));
        throw new Error(err.error || `Error ${response.status}`);
      }

      const data = await response.json();
      timers.forEach(clearTimeout);

      setProgressStage("finalizing");

      if (data.error) throw new Error(data.error);
      if (!data.lines) throw new Error("Invalid response format");

      let projectId: string | null = null;
      if (user) {
        projectId = crypto.randomUUID();
        const audioUrl = await uploadAudioImmediately(file, user.id, projectId);
        await supabase.from("saved_lyrics").upsert({
          id: projectId,
          user_id: user.id,
          title: resolveProjectTitle(data.title, file.name),
          artist: data.artist || "Unknown",
          lines: data.lines,
          filename: file.name,
          ...(audioUrl ? { audio_url: audioUrl } : {}),
          updated_at: new Date().toISOString(),
        });
      }

      await new Promise((r) => setTimeout(r, 600));

      setLyricData({
        title: resolveProjectTitle(data.title, file.name),
        artist: data.artist || "Unknown",
        lines: data.lines,
        hooks: data.hooks,
        metadata: data.metadata,
      } as LyricData);
      setAudioFile(file);
      setHasRealAudio(true);
      setSavedId(projectId);
      setDebugData(data._debug ?? null);
      // Cache audio in session so it survives remounts
      // Will be keyed to savedId once the project is saved
      if (projectId) {
        sessionAudio.set("lyric", projectId, file);
        onSavedId?.(projectId);
      } else {
        sessionAudio.set("lyric", "__unsaved__", file);
      }
      await quota.increment();
    } catch (e) {
      console.error("Transcription error:", e);
      toast.error(e instanceof Error ? e.message : "Failed to transcribe lyrics");
    } finally {
      setLoading(false);
      setProgressOpen(false);
    }
  }, [analysisModel, transcriptionModel, quota, uploadAudioImmediately, user, onSavedId, resolveProjectTitle]);

  const handleBack = useCallback(() => {
    setLyricData(null);
    setAudioFile(null);
    setHasRealAudio(false);
    setSavedId(null);
    setFmlyLines(null);
    setVersionMeta(null);
    setDebugData(null);
    setPrecomputedBeatGrid(null);
    setEarlyAudioBuffer(null);
    onNewProject?.();
  }, [onNewProject]);

  if (lyricData && audioFile) {
    return (
      <div className="flex-1 px-4 py-6">
        <LyricDisplay
          data={lyricData}
          audioFile={audioFile}
          hasRealAudio={hasRealAudio}
          savedId={savedId}
          fmlyLines={fmlyLines}
          versionMeta={versionMeta}
          debugData={debugData}
          initialBeatGrid={precomputedBeatGrid}
          initialSongDna={savedSongDna}
          onBack={handleBack}
          onSaved={(id) => {
            setSavedId(id);
            // Move cached audio to the saved project ID
            if (audioFile && hasRealAudio) sessionAudio.set("lyric", id, audioFile);
            sessionAudio.remove("lyric", "__unsaved__");
            onProjectSaved?.();
            onSavedId?.(id);
          }}
          onReuploadAudio={(file) => {
            setAudioFile(file);
            setHasRealAudio(true);
            // Cache re-uploaded audio
            const cacheId = savedId || "__unsaved__";
            sessionAudio.set("lyric", cacheId, file);
          }}
          onHeaderProject={onHeaderProject}
        />
        <LyricProgressModal open={progressOpen} currentStage={progressStage} fileName={progressFileName} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-8 overflow-hidden">
      <LyricUploader onTranscribe={handleTranscribe} onLoadSaved={(l: any) => {
        const filename = l.filename || "saved-lyrics.mp3";
        setLyricData({ title: resolveProjectTitle(l.title, filename), artist: l.artist, lines: l.lines as any[] });
        setSavedId(l.id);
        setFmlyLines((l as any).fmly_lines ?? null);
        setVersionMeta((l as any).version_meta ?? null);
        const savedBg = (l as any).beat_grid;
        if (savedBg) setPrecomputedBeatGrid(savedBg as BeatGridData);
        else setPrecomputedBeatGrid(null);
        // Check session cache for audio
        const cachedAudio = l.id ? sessionAudio.get("lyric", l.id) : undefined;
        if (cachedAudio) {
          setAudioFile(cachedAudio);
          setHasRealAudio(true);
        } else if (l.audio_url) {
          // Fetch from stored URL
          fetch(l.audio_url)
            .then(res => res.blob())
            .then(blob => {
              const file = new File([blob], filename, { type: blob.type || "audio/mpeg" });
              setAudioFile(file);
              setHasRealAudio(true);
              if (l.id) sessionAudio.set("lyric", l.id, file);
            })
            .catch(() => {
              const dummyFile = new File([], filename, { type: "audio/mpeg" });
              setAudioFile(dummyFile);
              setHasRealAudio(false);
            });
        } else {
          const dummyFile = new File([], filename, { type: "audio/mpeg" });
          setAudioFile(dummyFile);
          setHasRealAudio(false);
        }
      }} loading={loading} loadingMsg={loadingMsg} />
      <LyricProgressModal open={progressOpen} currentStage={progressStage} fileName={progressFileName} />
    </div>
  );
}
