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
import { LyricSkeleton } from "./LyricSkeleton";
import type { WaveformData } from "@/hooks/useAudioEngine";
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
  setWords?: (w: Array<{ word: string; start: number; end: number }> | null) => void;
  waveformData?: WaveformData | null;
  onProjectSaved?: () => void;
  onNewProject?: () => void;
  onHeaderProject?: HeaderProjectSetter;
  onSavedId?: (id: string) => void;
  analysisModel: string;
  transcriptionModel: string;
  sceneInput?: ReactNode;
  onAudioSubmitted?: (file: File) => void;
  onUploadStarted?: (payload: { file: File; projectId: string | null; title: string }) => void;
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
  setWords,
  waveformData,
  onProjectSaved,
  onNewProject,
  onHeaderProject,
  onSavedId,
  analysisModel,
  transcriptionModel,
  sceneInput,
  onAudioSubmitted,
  onUploadStarted,
}: Props) {
  const [loading, setLoading] = useState(false);
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
      const t0 = performance.now();
      console.log(`[LyricUpload] START file="${file.name}" size=${(file.size / 1024 / 1024).toFixed(2)}MB`);
      setLoading(true);

      const projectId = user ? crypto.randomUUID() : null;
      const draftTitle = resolveProjectTitle(null, file.name);
      setLyricData({ title: draftTitle, lines: [] });
      setLines([]);
      setAudioFile(file);
      setHasRealAudio(true);
      setSavedId(projectId);
      if (projectId) {
        sessionAudio.set("lyric", projectId, file);
      } else {
        sessionAudio.set("lyric", "__unsaved__", file);
      }
      onUploadStarted?.({ file, projectId, title: draftTitle });

      // Start beat grid analysis in parallel with transcription
      onAudioSubmitted?.(file);

      if (user && projectId) {
        void (async () => {
          const audioUploadPromise = uploadAudioImmediately(file, user.id, projectId);
          const { data: audioUrl } = await Promise.race([
            audioUploadPromise.then((url) => ({ data: url })),
            new Promise<{ data: string | null }>((resolve) => setTimeout(() => resolve({ data: null }), 15000)),
          ]);
          await supabase.from("saved_lyrics").upsert({
            id: projectId,
            user_id: user.id,
            title: draftTitle,
            lines: [],
            words: null,
            filename: file.name,
            ...(audioUrl ? { audio_url: audioUrl } : {}),
            updated_at: new Date().toISOString(),
          } as any);
        })();
      }

      try {
        // Only compress if over 25MB
        let uploadFile: File;
        if (file.size > MAX_RAW_UPLOAD_BYTES) {
          try {
            const ct0 = performance.now();
            uploadFile = await compressAudioFile(file);
            console.log(`[LyricUpload] COMPRESS done in ${(performance.now() - ct0).toFixed(0)}ms => ${(uploadFile.size / 1024 / 1024).toFixed(2)}MB`);
          } catch (compErr) {
            toast.error(compErr instanceof Error ? compErr.message : "Compression failed");
            setLoading(false);
            return;
          }
        } else {
          console.log(`[LyricUpload] SKIP compress (under 25MB)`);
          uploadFile = file;
        }

        console.log(`[LyricUpload] FETCH START (elapsed ${(performance.now() - t0).toFixed(0)}ms)`);

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

        console.log(`[LyricUpload] FETCH DONE (elapsed ${(performance.now() - t0).toFixed(0)}ms) status=${response.status}`);

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Transcription failed" }));
          throw new Error(err.error || `Error ${response.status}`);
        }

        const data = await response.json();

        if (data.error) throw new Error(data.error);
        if (!data.lines) throw new Error("Invalid response format");

        if (user && projectId) {
          // Non-blocking — don't let DB persist block the UI
          void supabase.from("saved_lyrics").upsert({
            id: projectId,
            user_id: user.id,
            title: resolveProjectTitle(data.title, file.name),
            lines: data.lines,
            words: data.words ?? null,
            filename: file.name,
            updated_at: new Date().toISOString(),
          } as any).then(({ error }) => {
            if (error) console.warn("[LyricUpload] post-transcription upsert failed:", error.message);
          });
        }

        const newLyricData: LyricData = {
          title: resolveProjectTitle(data.title, file.name),
          artist: data.artist || undefined,
          lines: data.lines,
          hooks: data.hooks,
          metadata: data.metadata,
        };
        setLyricData(newLyricData);
        setLines(data.lines);
        setWords?.(data.words ?? null);
        setAudioFile(file);
        setHasRealAudio(true);
        setSavedId(projectId);
        setDebugData(data._debug ?? null);

        if (projectId) {
          sessionAudio.set("lyric", projectId, file);
          onSavedId?.(projectId);
          onProjectSaved?.();
        } else {
          sessionAudio.set("lyric", "__unsaved__", file);
        }
        await quota.increment();
      } catch (e) {
        console.error("Transcription error:", e);
        toast.error(e instanceof Error ? e.message : "Failed to transcribe lyrics");
      } finally {
        console.log(`[LyricUpload] DONE (total ${(performance.now() - t0).toFixed(0)}ms)`);
        setLoading(false);
      }
    },
    [analysisModel, transcriptionModel, quota, uploadAudioImmediately, user, onSavedId, onProjectSaved, resolveProjectTitle, setLyricData, setLines, setAudioFile, setHasRealAudio, setSavedId, onAudioSubmitted, onUploadStarted],
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

  // State A: lines loaded → full editor
  if (lyricData && audioFile && lyricData.lines.length > 0) {
    return (
      <div className="flex-1 px-4 py-6 space-y-3">
        <LyricDisplay
          data={lyricData}
          audioFile={audioFile}
          hasRealAudio={hasRealAudio}
          savedId={savedId}
          initialBeatGrid={beatGrid}
          initialWaveform={waveformData}
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

  // State D: nothing yet → uploader
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 overflow-y-auto">
      <LyricUploader
        onTranscribe={handleTranscribe}
        loading={loading}
        loadingMsg="Syncing..."
        sceneInput={sceneInput}
      />
    </div>
  );
}
