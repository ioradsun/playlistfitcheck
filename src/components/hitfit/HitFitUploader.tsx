import { useState } from "react";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { Upload, X, Music, Youtube, Info } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AudioUploadZone } from "@/components/ui/AudioUploadZone";

export type ReferenceSource =
  | { type: "file"; file: File }
  | { type: "youtube"; url: string }
  | { type: "spotify"; url: string }
  | { type: "none" };

interface Props {
  onAnalyze: (master1: File, master2: File | null, reference: ReferenceSource) => void;
  loading: boolean;
  disabled?: boolean;
  disabledMessage?: string;
}

type RefMode = "upload" | "youtube" | "spotify";

export function HitFitUploader({ onAnalyze, loading, disabled, disabledMessage }: Props) {
  const siteCopy = useSiteCopy();
  const [master1Files, setMaster1Files] = useState<File[]>([]);
  const [master2Files, setMaster2Files] = useState<File[]>([]);
  const [refMode, setRefMode] = useState<RefMode>("upload");
  const [refFiles, setRefFiles] = useState<File[]>([]);
  const [refUrl, setRefUrl] = useState("");

  const hasReference =
    (refMode === "upload" && refFiles.length > 0) ||
    ((refMode === "youtube" || refMode === "spotify") && refUrl.trim().length > 0);

  const canSubmit = master1Files.length > 0 && !loading;

  const handleSubmit = () => {
    if (!master1Files[0]) return;
    let ref: ReferenceSource;
    if (refMode === "upload" && refFiles[0]) {
      ref = { type: "file", file: refFiles[0] };
    } else if (refMode === "youtube" && refUrl.trim()) {
      ref = { type: "youtube", url: refUrl.trim() };
    } else if (refMode === "spotify" && refUrl.trim()) {
      ref = { type: "spotify", url: refUrl.trim() };
    } else {
      ref = { type: "none" };
    }
    onAnalyze(master1Files[0], master2Files[0] || null, ref);
  };

  const refModes: { mode: RefMode; label: string; icon: React.ReactNode }[] = [
    { mode: "upload", label: "File", icon: <Upload size={12} /> },
    { mode: "spotify", label: "Spotify", icon: <Music size={12} /> },
    { mode: "youtube", label: "YouTube", icon: <Youtube size={12} /> },
  ];

  const slots = [
    { label: "Master A", desc: "Your primary mastered track · MP3, WAV, M4A · 75 MB max · Large files auto-compressed", files: master1Files, onChange: setMaster1Files, required: true },
    { label: "Master B", desc: "Optional second master to compare · MP3, WAV, M4A · 75 MB max", files: master2Files, onChange: setMaster2Files, required: false },
  ];

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <div className="text-center space-y-1">
        <h1 className="text-xl font-semibold text-foreground">{siteCopy.tools.hitfit?.heading || "Compare Your Track to Your Target Sound"}</h1>
        {siteCopy.tools.hitfit?.subheading && <p className="text-sm text-muted-foreground">{siteCopy.tools.hitfit.subheading}</p>}
      </div>

      <div className="space-y-3">
        {slots.map((slot, i) => (
          <div key={i} className={`glass-card rounded-xl p-4 transition-all ${slot.files.length > 0 ? "border-primary/30" : "border-border"}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-medium">{slot.label}</span>
              {!slot.required && (
                <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">Optional</span>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                    <Info size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[220px]">{slot.desc}</TooltipContent>
              </Tooltip>
            </div>
            <AudioUploadZone
              label="Upload"
              files={slot.files}
              onChange={slot.onChange}
              maxFiles={1}
              disabled={loading}
            />
          </div>
        ))}

        {/* Reference slot */}
        <div className={`glass-card rounded-xl p-4 transition-all ${hasReference ? "border-primary/30" : "border-border"}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium">Reference Track</span>
            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">Optional</span>
          </div>

          <div className="flex gap-1 mb-3 bg-secondary/50 rounded-lg p-0.5">
            {refModes.map(({ mode, label, icon }) => (
              <button
                key={mode}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md transition-colors ${
                  refMode === mode
                    ? "bg-background text-foreground shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => { setRefMode(mode); setRefFiles([]); setRefUrl(""); }}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {refMode === "upload" ? (
            <AudioUploadZone
              label="Upload"
              files={refFiles}
              onChange={setRefFiles}
              maxFiles={1}
              disabled={loading}
            />
          ) : (
            <Input
              placeholder={refMode === "spotify" ? "Paste Spotify track URL…" : "Paste YouTube URL…"}
              value={refUrl}
              onChange={(e) => setRefUrl(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text").trim();
                if (
                  (refMode === "spotify" && pasted.includes("spotify.com/track/")) ||
                  (refMode === "youtube" && (pasted.includes("youtube.com/") || pasted.includes("youtu.be/")))
                ) {
                  e.preventDefault();
                  setRefUrl(pasted);
                }
              }}
              className="h-11 bg-transparent border-0 focus-visible:ring-0 text-sm"
            />
          )}
        </div>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Button
              className="w-full gap-2 glow-primary"
              size="lg"
              disabled={!canSubmit || disabled}
              onClick={handleSubmit}
            >
              {loading ? "Analyzing…" : "Analyze"}
            </Button>
          </div>
        </TooltipTrigger>
        {disabled && disabledMessage && (
          <TooltipContent>{disabledMessage}</TooltipContent>
        )}
      </Tooltip>
    </div>
  );
}
