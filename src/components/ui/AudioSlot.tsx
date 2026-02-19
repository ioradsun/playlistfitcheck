import { AudioUploadZone } from "@/components/ui/AudioUploadZone";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface AudioSlotProps {
  label: string;
  hint?: string;
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  disabled?: boolean;
  optional?: boolean;
  active?: boolean;
}

export function AudioSlot({ label, hint, files, onChange, maxFiles = 1, disabled, optional, active }: AudioSlotProps) {
  return (
    <div className={`glass-card rounded-xl p-4 transition-all ${active ? "border-primary/30" : "border-border"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {optional && (
            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">Optional</span>
          )}
          {hint && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                  <Info size={13} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[220px]">{hint}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <AudioUploadZone
        label="Upload"
        files={files}
        onChange={onChange}
        maxFiles={maxFiles}
        disabled={disabled}
      />
    </div>
  );
}
