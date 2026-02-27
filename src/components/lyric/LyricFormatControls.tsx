
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Strictness } from "@/lib/profanityFilter";
import type { ActiveVersion } from "./VersionToggle";

export type LineFormat =
  | "natural"
  | "1_word"
  | "2_3_words"
  | "4_6_words"
  | "break_on_pause";

export type SocialPreset =
  | "lyricFocus";

interface LyricFormatControlsProps {
  activeVersion: ActiveVersion;
  lineFormat: LineFormat;
  socialPreset: SocialPreset;
  strictness: Strictness;
  onLineFormatChange: (v: LineFormat) => void;
  onSocialPresetChange: (v: SocialPreset) => void;
  onStrictnessChange: (v: Strictness) => void;
}

export function LyricFormatControls({
  activeVersion,
  lineFormat,
  socialPreset,
  strictness,
  onLineFormatChange,
  onSocialPresetChange,
  onStrictnessChange,
}: LyricFormatControlsProps) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Formatting</p>

      <div className="space-y-1.5">
        <label className="text-[11px] text-muted-foreground">Line Format</label>
        <Select value={lineFormat} onValueChange={(v) => onLineFormatChange(v as LineFormat)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="natural" className="text-xs">Natural Phrases</SelectItem>
            <SelectItem value="1_word" className="text-xs">1 Word Per Line</SelectItem>
            <SelectItem value="2_3_words" className="text-xs">2–3 Words Per Line</SelectItem>
            <SelectItem value="4_6_words" className="text-xs">4–6 Words Per Line</SelectItem>
            <SelectItem value="break_on_pause" className="text-xs">Break On Pause</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] text-muted-foreground">Optimized For</label>
        <Select value={socialPreset} onValueChange={(v) => onSocialPresetChange(v as SocialPreset)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lyricFocus" className="text-xs">LyricFocus</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {activeVersion === "fmly" && (
        <div className="space-y-1.5">
          <label className="text-[11px] text-muted-foreground">Filter Strictness</label>
          <Select value={strictness} onValueChange={(v) => onStrictnessChange(v as Strictness)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mild" className="text-xs">Mild</SelectItem>
              <SelectItem value="standard" className="text-xs">Standard (default)</SelectItem>
              <SelectItem value="strict" className="text-xs">Strict</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
