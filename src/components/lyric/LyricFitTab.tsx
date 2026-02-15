import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LyricUploader } from "./LyricUploader";
import { LyricDisplay, type LyricData } from "./LyricDisplay";

interface Props {
  initialLyric?: any;
  onProjectSaved?: () => void;
}

export function LyricFitTab({ initialLyric, onProjectSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [lyricData, setLyricData] = useState<LyricData | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Load saved lyric from dashboard navigation
  useEffect(() => {
    if (initialLyric && !lyricData) {
      setLyricData({
        title: initialLyric.title,
        artist: initialLyric.artist,
        lines: initialLyric.lines as any[],
      });
      setSavedId(initialLyric.id);
      // Create a dummy file for the display component (no actual audio)
      const dummyFile = new File([], initialLyric.filename || "saved-lyrics.mp3", { type: "audio/mpeg" });
      setAudioFile(dummyFile);
    }
  }, [initialLyric, lyricData]);

  const handleTranscribe = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("audio", file);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lyric-transcribe`,
        {
          method: "POST",
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Transcription failed" }));
        throw new Error(err.error || `Error ${response.status}`);
      }

      const data = await response.json();

      if (data.error) throw new Error(data.error);
      if (!data.lines) throw new Error("Invalid response format");

      setLyricData(data as LyricData);
      setAudioFile(file);
      setSavedId(null);
    } catch (e) {
      console.error("Transcription error:", e);
      toast.error(e instanceof Error ? e.message : "Failed to transcribe lyrics");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBack = useCallback(() => {
    setLyricData(null);
    setAudioFile(null);
    setSavedId(null);
  }, []);

  if (lyricData && audioFile) {
    return (
      <div className="flex-1 px-4 py-6">
        <LyricDisplay
          data={lyricData}
          audioFile={audioFile}
          savedId={savedId}
          onBack={handleBack}
          onSaved={(id) => { setSavedId(id); onProjectSaved?.(); }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-8 overflow-hidden">
      <LyricUploader onTranscribe={handleTranscribe} onLoadSaved={(l: any) => {
        setLyricData({ title: l.title, artist: l.artist, lines: l.lines as any[] });
        setSavedId(l.id);
        const dummyFile = new File([], l.filename || "saved-lyrics.mp3", { type: "audio/mpeg" });
        setAudioFile(dummyFile);
      }} loading={loading} />
    </div>
  );
}
