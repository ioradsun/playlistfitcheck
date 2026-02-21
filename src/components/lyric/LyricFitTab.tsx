import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUsageQuota } from "@/hooks/useUsageQuota";
import { compressAudioFile } from "@/lib/compressAudio";
import { toast } from "sonner";
import { LyricUploader } from "./LyricUploader";
import { LyricDisplay, type LyricData } from "./LyricDisplay";
import { LyricProgressModal, type ProgressStage } from "./LyricProgressModal";

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
  const [analysisModel, setAnalysisModel] = useState("google/gemini-2.5-flash");
  const [transcriptionModel, setTranscriptionModel] = useState("scribe");
  const { user } = useAuth();
  const quota = useUsageQuota("lyric");

  // Load saved lyric from dashboard navigation
  useEffect(() => {
    if (initialLyric && !lyricData) {
      setLyricData({
        title: initialLyric.title,
        artist: initialLyric.artist,
        lines: initialLyric.lines as any[],
      });
      setSavedId(initialLyric.id);
      setFmlyLines((initialLyric as any).fmly_lines ?? null);
      setVersionMeta((initialLyric as any).version_meta ?? null);
      const dummyFile = new File([], initialLyric.filename || "saved-lyrics.mp3", { type: "audio/mpeg" });
      setAudioFile(dummyFile);
      setHasRealAudio(false);
    }
  }, [initialLyric, lyricData]);

  // Read pipeline model config from site_copy
  useEffect(() => {
    supabase.from("site_copy").select("copy_json").limit(1).single().then(({ data }) => {
      const f = (data?.copy_json as any)?.features || {};
      if (f.lyric_analysis_model) setAnalysisModel(f.lyric_analysis_model);
      if (f.lyric_transcription_model) setTranscriptionModel(f.lyric_transcription_model);
    });
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

      // Stage 3: Upload — auto-advance through sub-stages every 3s while request is in flight
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

      // Upload finished — clear upload sub-stage timers
      uploadTimers.forEach(clearTimeout);

      // Once request is sent, simulate backend stages with timers
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

      // Brief finalizing flash
      setProgressStage("finalizing");

      if (data.error) throw new Error(data.error);
      if (!data.lines) throw new Error("Invalid response format");

      // Small delay so user sees "Quality Check" complete
      await new Promise((r) => setTimeout(r, 600));

      setLyricData({
        title: data.title || file.name.replace(/\.[^/.]+$/, "") || "Unknown",
        artist: data.artist || "Unknown",
        lines: data.lines,
        hooks: data.hooks,
        metadata: data.metadata,
      } as LyricData);
      setAudioFile(file);
      setHasRealAudio(true);
      setSavedId(null);
      setDebugData(data._debug ?? null);
      await quota.increment();
    } catch (e) {
      console.error("Transcription error:", e);
      toast.error(e instanceof Error ? e.message : "Failed to transcribe lyrics");
    } finally {
      setLoading(false);
      setProgressOpen(false);
    }
  }, [analysisModel, transcriptionModel, quota]);

  const handleBack = useCallback(() => {
    setLyricData(null);
    setAudioFile(null);
    setHasRealAudio(false);
    setSavedId(null);
    setFmlyLines(null);
    setVersionMeta(null);
    setDebugData(null);
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
          onBack={handleBack}
          onSaved={(id) => { setSavedId(id); onProjectSaved?.(); onSavedId?.(id); }}
          onReuploadAudio={(file) => { setAudioFile(file); setHasRealAudio(true); }}
          onHeaderProject={onHeaderProject}
        />
        <LyricProgressModal open={progressOpen} currentStage={progressStage} fileName={progressFileName} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-8 overflow-hidden">
      <LyricUploader onTranscribe={handleTranscribe} onLoadSaved={(l: any) => {
        setLyricData({ title: l.title, artist: l.artist, lines: l.lines as any[] });
        setSavedId(l.id);
        setFmlyLines((l as any).fmly_lines ?? null);
        setVersionMeta((l as any).version_meta ?? null);
        const dummyFile = new File([], l.filename || "saved-lyrics.mp3", { type: "audio/mpeg" });
        setAudioFile(dummyFile);
        setHasRealAudio(false);
      }} loading={loading} loadingMsg={loadingMsg} />
      <LyricProgressModal open={progressOpen} currentStage={progressStage} fileName={progressFileName} />
    </div>
  );
}
