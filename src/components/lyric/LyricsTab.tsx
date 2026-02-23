/**
 * LyricsTab — Upload audio, transcribe, render inline editor.
 * No analysis, no DNA, no cinematic direction.
 */

import { useState, useCallback } from "react";
import type { BeatGridData } from "@/hooks/useBeatGrid";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUsageQuota } from "@/hooks/useUsageQuota";
import { compressAudioFile } from "@/lib/compressAudio";
import { sessionAudio } from "@/lib/sessionAudioCache";
import { toast } from "sonner";
import { LyricUploader } from "./LyricUploader";
import { LyricDisplay, type LyricData, type LyricLine } from "./LyricDisplay";
import { LyricProgressModal, type ProgressStage } from "./LyricProgressModal";
import type { ReactNode } from "react";

const MAX_RAW_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export type HeaderProjectSetter = (
  project: {
    title: string;
    onBack: () => void;
    rightContent?: ReactNode;
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
  fmlyLines: any[] | null;
  setFmlyLines: (l: any[] | null) => void;
  versionMeta: any | null;
  setVersionMeta: (v: any | null) => void;
  beatGrid?: BeatGridData | null;
  onProjectSaved?: () => void;
  onNewProject?: () => void;
  onHeaderProject?: HeaderProjectSetter;
  onSavedId?: (id: string) => void;
  analysisModel: string;
  transcriptionModel: string;
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
  fmlyLines,
  setFmlyLines,
  versionMeta,
  setVersionMeta,
  beatGrid,
  onProjectSaved,
  onNewProject,
  onHeaderProject,
  onSavedId,
  analysisModel,
  transcriptionModel,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Syncing...");
  const [progressStage, setProgressStage] = useState<ProgressStage>("compressing");
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressFileName, setProgressFileName] = useState<string>("");
  const [debugData, setDebugData] = useState<any | null>(null);
  const { user } = useAuth();
  const quota = useUsageQuota("lyric");

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

  const uploadAudioImmediately = useCallback(
    async (file: File, userId: string, projectId: string): Promise<string | null> => {
      const ext = file.name.split(".").pop() ?? "mp3";
      const path = `${userId}/lyric/${projectId}.${ext}`;
      const { error } = await supabase.storage
        .from("audio-clips")
        .upload(path, file, { upsert: true });
      if (error) return null;
      const { data } = supabase.storage.from("audio-clips").getPublicUrl(path);
      return data.publicUrl;
    },
    [],
  );

  const handleTranscribe = useCallback(
    async (file: File, referenceLyrics?: string) => {
      if (!quota.canUse) {
        toast.error(
          quota.tier === "anonymous"
            ? "Sign up for more uses"
            : "Invite an artist to unlock unlimited",
        );
        return;
      }
      setLoading(true);
      setProgressFileName(file.name);
      setProgressStage("compressing");
      setProgressOpen(true);

      try {
        // Only compress if over 25MB
        let uploadFile: File;
        if (file.size > MAX_RAW_UPLOAD_BYTES) {
          setProgressStage("compressing");
          try {
            uploadFile = await compressAudioFile(file);
          } catch (compErr) {
            toast.error(compErr instanceof Error ? compErr.message : "Compression failed");
            setLoading(false);
            setProgressOpen(false);
            return;
          }
        } else {
          uploadFile = file;
        }

        // Upload stage
        setProgressStage("uploading");
        const uploadTimers: ReturnType<typeof setTimeout>[] = [];
        uploadTimers.push(setTimeout(() => setProgressStage("buffering"), 3000));
        uploadTimers.push(setTimeout(() => setProgressStage("transmitting"), 6000));
        uploadTimers.push(setTimeout(() => setProgressStage("handshaking"), 9000));

        const formData = new FormData();
        formData.append("audio", uploadFile, uploadFile.name);
        formData.append("analysisModel", analysisModel);
        formData.append("transcriptionModel", transcriptionModel);
        if (referenceLyrics?.trim()) {
          formData.append("referenceLyrics", referenceLyrics.trim());
        }

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lyric-transcribe`,
          {
            method: "POST",
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: formData,
          },
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

        const newLyricData: LyricData = {
          title: resolveProjectTitle(data.title, file.name),
          artist: data.artist || "Unknown",
          lines: data.lines,
          hooks: data.hooks,
          metadata: data.metadata,
        };
        setLyricData(newLyricData);
        setLines(data.lines);
        setAudioFile(file);
        setHasRealAudio(true);
        setSavedId(projectId);
        setDebugData(data._debug ?? null);

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
    },
    [analysisModel, transcriptionModel, quota, uploadAudioImmediately, user, onSavedId, resolveProjectTitle, setLyricData, setLines, setAudioFile, setHasRealAudio, setSavedId],
  );

  const handleBack = useCallback(() => {
    setLyricData(null);
    setAudioFile(null);
    setHasRealAudio(false);
    setSavedId(null);
    setFmlyLines(null);
    setVersionMeta(null);
    setDebugData(null);
    onNewProject?.();
  }, [onNewProject, setLyricData, setAudioFile, setHasRealAudio, setSavedId, setFmlyLines, setVersionMeta]);

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
          onSaved={(id) => {
            setSavedId(id);
            if (audioFile && hasRealAudio) sessionAudio.set("lyric", id, audioFile);
            sessionAudio.remove("lyric", "__unsaved__");
            onProjectSaved?.();
            onSavedId?.(id);
          }}
          onReuploadAudio={(file) => {
            setAudioFile(file);
            setHasRealAudio(true);
            const cacheId = savedId || "__unsaved__";
            sessionAudio.set("lyric", cacheId, file);
          }}
          onHeaderProject={onHeaderProject}
        />
        <LyricProgressModal
          open={progressOpen}
          currentStage={progressStage}
          fileName={progressFileName}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-8 overflow-hidden">
      <LyricUploader
        onTranscribe={handleTranscribe}
        loading={loading}
        loadingMsg={loadingMsg}
      />
      <LyricProgressModal
        open={progressOpen}
        currentStage={progressStage}
        fileName={progressFileName}
      />
    </div>
  );
}
