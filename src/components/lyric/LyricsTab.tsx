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
import { getAudioStoragePath } from "@/lib/audioStoragePath";
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
      const path = getAudioStoragePath(userId, projectId, file.name);
      const { error } = await supabase.storage
        .from("audio-clips")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (error) {
        console.warn("[Pipeline] Audio upload failed during transcription pipeline:", error.message);
        return null;
      }
      const { data } = supabase.storage.from("audio-clips").getPublicUrl(path);
      console.log("[Pipeline] Audio uploaded to storage:", data.publicUrl);
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
      const ms = () => `${(performance.now() - t0).toFixed(0)}ms`;
      console.log(`[Transcribe Debug] ${ms()} ENTRY file="${file.name}" size=${(file.size / 1024 / 1024).toFixed(2)}MB type=${file.type}`);
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

      // Upload audio to storage FIRST, then pass URL to edge function
      // Same-datacenter fetch is ~1s vs 33s multipart upload from client
      let storageAudioUrl: string | null = null;
      if (user && projectId) {
        console.log(`[Transcribe Debug] ${ms()} uploading audio to storage first`);
        storageAudioUrl = await uploadAudioImmediately(file, user.id, projectId);
        console.log(`[Transcribe Debug] ${ms()} storage upload done, url=${storageAudioUrl ? 'yes' : 'null'}`);
        // Save project row with audio_url (fire-and-forget)
        void supabase.from("saved_lyrics").upsert({
          id: projectId,
          user_id: user.id,
          title: draftTitle,
          lines: [],
          words: null,
          filename: file.name,
          ...(storageAudioUrl ? { audio_url: storageAudioUrl } : {}),
          updated_at: new Date().toISOString(),
        } as any).then(({ error }) => {
          if (error) console.warn("[Pipeline] Initial project save failed:", error.message);
        });
      }

      try {
        // Only compress if over 25MB (only needed for fallback multipart path)
        console.log(`[Transcribe Debug] ${ms()} compression check (threshold=${(MAX_RAW_UPLOAD_BYTES/1024/1024).toFixed(0)}MB, file=${(file.size/1024/1024).toFixed(2)}MB)`);
        let uploadFile: File;
        if (file.size > MAX_RAW_UPLOAD_BYTES) {
          try {
            const ct0 = performance.now();
            uploadFile = await compressAudioFile(file);
          console.log(`[Transcribe Debug] ${ms()} compressed to ${(uploadFile.size / 1024 / 1024).toFixed(2)}MB`);
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

        console.log(`[Transcribe Debug] ${ms()} starting fetch to lyric-transcribe`);
        console.log(`[LyricUpload] FETCH START (elapsed ${(performance.now() - t0).toFixed(0)}ms)`);

        let response: Response;
        if (storageAudioUrl) {
          // Fast path: send URL, edge function fetches from same datacenter
          console.log(`[Transcribe Debug] ${ms()} using URL-based transcription (fast path)`);
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
                analysisModel,
                transcriptionModel,
                ...(referenceLyrics?.trim() ? { referenceLyrics: referenceLyrics.trim() } : {}),
              }),
            },
          );
        } else {
          // Fallback: multipart upload (anonymous users without storage)
          console.log(`[Transcribe Debug] ${ms()} using multipart upload (fallback)`);
          const formData = new FormData();
          formData.append("audio", uploadFile, uploadFile.name);
          formData.append("analysisModel", analysisModel);
          formData.append("transcriptionModel", transcriptionModel);
          if (referenceLyrics?.trim()) {
            formData.append("referenceLyrics", referenceLyrics.trim());
          }
          response = await fetch(
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
        }

        console.log(`[Transcribe Debug] ${ms()} fetch returned status=${response.status}`);
        console.log(`[LyricUpload] FETCH DONE (elapsed ${(performance.now() - t0).toFixed(0)}ms) status=${response.status}`);

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Transcription failed" }));
          throw new Error(err.error || `Error ${response.status}`);
        }

        const data = await response.json();
        console.log(`[Transcribe Debug] ${ms()} parsed JSON, lines=${data.lines?.length}, words=${data.words?.length}`);

        if (data.error) throw new Error(data.error);
        if (!data.lines) throw new Error("Invalid response format");

        if (user && projectId) {
          console.log(`[Transcribe Debug] ${ms()} starting DB save`);
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

        console.log(`[Transcribe Debug] ${ms()} setting lyric data`);
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
        console.log(`[Transcribe Debug] ${ms()} ERROR: ${e instanceof Error ? e.message : String(e)}`);
        console.error("Transcription error:", e);
        toast.error(e instanceof Error ? e.message : "Failed to transcribe lyrics");
      } finally {
        console.log(`[Transcribe Debug] ${ms()} DONE, setting loading=false`);
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
