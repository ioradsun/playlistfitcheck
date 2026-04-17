import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { VideoOptions } from "@/types/CinematicDirection";

interface Props {
  projectId: string;
  initialOptions: VideoOptions;
  onChange?: (options: VideoOptions) => void;
}

export const VideoOptionsPanel = memo(function VideoOptionsPanel({
  projectId,
  initialOptions,
  onChange,
}: Props) {
  const [options, setOptions] = useState<VideoOptions>(initialOptions);
  const [writing, setWriting] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWriteIdRef = useRef(0);

  useEffect(() => {
    setOptions(initialOptions);
  }, [initialOptions]);

  const flushWrite = useCallback(async (next: VideoOptions) => {
    const writeId = ++pendingWriteIdRef.current;
    setWriting(true);
    try {
      const { data } = await supabase
        .from("lyric_projects")
        .select("cinematic_direction")
        .eq("id", projectId)
        .maybeSingle();
      const cinematicDirection = (data?.cinematic_direction as Record<string, unknown> | null) ?? {};
      const merged = { ...cinematicDirection, options: next };
      await supabase
        .from("lyric_projects")
        .update({ cinematic_direction: merged })
        .eq("id", projectId);
    } finally {
      if (writeId === pendingWriteIdRef.current) {
        setWriting(false);
      }
    }
  }, [projectId]);

  const commit = useCallback((next: VideoOptions) => {
    setOptions(next);
    onChange?.(next);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void flushWrite(next);
      saveTimerRef.current = null;
    }, 300);
  }, [flushWrite, onChange]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label="Video options"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          <Settings size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="end">
        <div className="space-y-4">
          <div>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Overlays</div>
            <div className="flex items-center justify-between py-1.5">
              <Label htmlFor="opt-beat" className="text-sm">Beat visualizer</Label>
              <Switch
                id="opt-beat"
                checked={options.beatVisualizer}
                onCheckedChange={() => commit({ ...options, beatVisualizer: !options.beatVisualizer })}
              />
            </div>
            <div className="flex items-center justify-between py-1.5">
              <Label htmlFor="opt-wick" className="text-sm">Wick progress bar</Label>
              <Switch
                id="opt-wick"
                checked={options.wickBar}
                onCheckedChange={() => commit({ ...options, wickBar: !options.wickBar })}
              />
            </div>
          </div>
          <div>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Visual</div>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm">Intensity</span>
              <div className="flex rounded-full bg-card/50 p-0.5">
                <button
                  onClick={() => commit({ ...options, intensity: "soft" })}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${options.intensity === "soft" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
                >
                  Soft
                </button>
                <button
                  onClick={() => commit({ ...options, intensity: "hard" })}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${options.intensity === "hard" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
                >
                  Hard
                </button>
              </div>
            </div>
          </div>
          {writing && <div className="font-mono text-[10px] text-muted-foreground">Saving…</div>}
        </div>
      </PopoverContent>
    </Popover>
  );
});
