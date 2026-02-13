import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LyricUploader } from "./LyricUploader";
import { LyricDisplay, type LyricData } from "./LyricDisplay";

export function LyricFitTab() {
  const [loading, setLoading] = useState(false);
  const [lyricData, setLyricData] = useState<LyricData | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);

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
  }, []);

  if (lyricData && audioFile) {
    return <LyricDisplay data={lyricData} audioFile={audioFile} onBack={handleBack} />;
  }

  return <LyricUploader onTranscribe={handleTranscribe} loading={loading} />;
}
