import { useCallback, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { RecentItem } from "@/components/AppSidebar";

export type AudioToolKey = "lyric" | "hitfit" | "mix" | "vibefit" | "crowdfit" | "dreamfit";

const PRIMARY_BUCKET = "audio-files";
const FALLBACK_BUCKET = "audio-clips";

export function getUnifiedStoragePath(userId: string, tool: AudioToolKey, projectId: string, fileName: string) {
  const ext = fileName.split(".").pop() || "mp3";
  return `${userId}/${tool}/${projectId}.${ext}`;
}

interface UseAudioProjectConfig {
  tool: AudioToolKey;
  dbTable: string;
  buildStubRow: (opts: { projectId: string; file: File; audioUrl: string; userId: string }) => Record<string, unknown>;
  getSidebarLabel: (file: File) => string;
  getSidebarRawData: (opts: { projectId: string; file: File; audioUrl: string }) => unknown;
  onOptimisticItem?: (item: RecentItem) => void;
  onProjectCreated?: (projectId: string) => void;
  /** Set to false if the target table has no audio_url column. Defaults to true. */
  includeAudioUrl?: boolean;
}

interface AudioProject {
  projectId: string;
  audioUrl: string;
  file: File;
}

async function uploadAudioFile(storagePath: string, file: File) {
  const options = { upsert: true, contentType: file.type || undefined };

  const primary = await supabase.storage.from(PRIMARY_BUCKET).upload(storagePath, file, options);
  if (!primary.error) {
    const { data } = supabase.storage.from(PRIMARY_BUCKET).getPublicUrl(storagePath);
    return data.publicUrl;
  }

  const fallback = await supabase.storage.from(FALLBACK_BUCKET).upload(storagePath, file, options);
  if (fallback.error) throw primary.error;

  const { data } = supabase.storage.from(FALLBACK_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export function useAudioProject(config: UseAudioProjectConfig) {
  const { user } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [showAuthNudge, setShowAuthNudge] = useState(false);

  const handleFileSelected = useCallback(
    async (file: File): Promise<AudioProject | null> => {
      if (!user) {
        setShowAuthNudge(true);
        return null;
      }

      setIsCreating(true);
      try {
        const projectId = uuidv4();
        const storagePath = getUnifiedStoragePath(user.id, config.tool, projectId, file.name);
        const audioUrl = await uploadAudioFile(storagePath, file);

        const stubRow: Record<string, unknown> = {
          id: projectId,
          ...config.buildStubRow({ projectId, file, audioUrl, userId: user.id }),
        };
        // Only include audio_url if the table supports it
        if (config.includeAudioUrl !== false) {
          stubRow.audio_url = audioUrl;
        }

        const { error: dbError } = await supabase.from(config.dbTable as any).insert(stubRow as any);
        if (dbError) throw dbError;

        config.onOptimisticItem?.({
          id: projectId,
          label: config.getSidebarLabel(file),
          meta: "just now",
          type: config.tool === "crowdfit" ? "songfit" : config.tool,
          rawData: config.getSidebarRawData({ projectId, file, audioUrl }),
        });

        config.onProjectCreated?.(projectId);

        return { projectId, audioUrl, file };
      } catch (error) {
        console.error(`[useAudioProject:${config.tool}] Failed to create project`, error);
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [config, user],
  );

  return {
    handleFileSelected,
    isCreating,
    showAuthNudge,
    dismissAuthNudge: () => setShowAuthNudge(false),
  };
}
