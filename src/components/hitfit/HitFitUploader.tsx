import { useState, useRef } from "react";

import { Upload, X, Disc3, Music, Loader2, Link, Youtube } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ReferenceSource =
  | { type: "file"; file: File }
  | { type: "youtube"; url: string }
  | { type: "spotify"; url: string };

interface Props {
  onAnalyze: (master1: File, master2: File | null, reference: ReferenceSource) => void;
  loading: boolean;
}

type RefMode = "upload" | "youtube" | "spotify";

export function HitFitUploader({ onAnalyze, loading }: Props) {
  const [master1, setMaster1] = useState<File | null>(null);
  const [master2, setMaster2] = useState<File | null>(null);
  const [refMode, setRefMode] = useState<RefMode>("upload");
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refUrl, setRefUrl] = useState("");
  const master1Ref = useRef<HTMLInputElement>(null);
  const master2Ref = useRef<HTMLInputElement>(null);
  const refFileRef = useRef<HTMLInputElement>(null);

  const hasReference =
    (refMode === "upload" && refFile) ||
    (refMode === "youtube" && refUrl.trim().length > 0) ||
    (refMode === "spotify" && refUrl.trim().length > 0);

  const canSubmit = master1 && hasReference && !loading;

  const handleSubmit = () => {
    if (!master1 || !hasReference) return;
    let ref: ReferenceSource;
    if (refMode === "upload" && refFile) {
      ref = { type: "file", file: refFile };
    } else if (refMode === "youtube") {
      ref = { type: "youtube", url: refUrl.trim() };
    } else {
      ref = { type: "spotify", url: refUrl.trim() };
    }
    onAnalyze(master1, master2, ref);
  };

  const clearRef = () => {
    setRefFile(null);
    setRefUrl("");
  };

  const acceptTypes = ".mp3,.wav,.m4a,.aac,.ogg,.flac,.aiff,.wma";

  const masterSlots: { label: string; desc: string; file: File | null; setFile: (f: File | null) => void; inputRef: React.RefObject<HTMLInputElement | null>; required: boolean }[] = [
    { label: "Master A", desc: "Your primary mastered track", file: master1, setFile: setMaster1, inputRef: master1Ref, required: true },
    { label: "Master B", desc: "Optional second master to compare", file: master2, setFile: setMaster2, inputRef: master2Ref, required: false },
  ];

  const refModes: { mode: RefMode; label: string; icon: React.ReactNode }[] = [
    { mode: "upload", label: "Upload", icon: <Upload size={12} /> },
    { mode: "spotify", label: "Spotify", icon: <Music size={12} /> },
    { mode: "youtube", label: "YouTube", icon: <Youtube size={12} /> },
  ];

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <div className="text-center space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Compare Your Track to Your Target Sound</h1>
      </div>

      <div className="space-y-3">
        {/* Master slots */}
        {masterSlots.map((slot, i) => (
          <div
            key={i}
            className={`glass-card rounded-xl p-4 transition-all ${slot.file ? "border-primary/30" : "border-border"}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Disc3 size={18} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{slot.label}</p>
                  {!slot.required && (
                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">Optional</span>
                  )}
                </div>
                {slot.file ? (
                  <p className="text-xs text-muted-foreground truncate">{slot.file.name}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">{slot.desc}</p>
                )}
              </div>
              {slot.file ? (
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => slot.setFile(null)}>
                  <X size={16} />
                </Button>
              ) : (
                <>
                  <input
                    ref={slot.inputRef}
                    type="file"
                    accept={acceptTypes}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) slot.setFile(f);
                      e.target.value = "";
                    }}
                  />
                  <Button variant="secondary" size="sm" className="shrink-0 gap-1.5" onClick={() => slot.inputRef.current?.click()}>
                    <Upload size={14} /> Choose
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Reference slot */}
        <div className={`glass-card rounded-xl p-4 transition-all ${hasReference ? "border-primary/30" : "border-border"}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Music size={18} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Reference Track</p>
              <p className="text-xs text-muted-foreground">A released track with the sound you're targeting</p>
            </div>
            {hasReference && (
              <Button variant="ghost" size="icon" className="shrink-0" onClick={clearRef}>
                <X size={16} />
              </Button>
            )}
          </div>

          {/* Mode tabs */}
          <div className="flex gap-1 mb-3 bg-secondary/50 rounded-lg p-0.5">
            {refModes.map(({ mode, label, icon }) => (
              <button
                key={mode}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md transition-colors ${
                  refMode === mode
                    ? "bg-background text-foreground shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => { setRefMode(mode); clearRef(); }}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {/* Mode content */}
          {refMode === "upload" ? (
            refFile ? (
              <p className="text-xs text-muted-foreground truncate px-1">{refFile.name}</p>
            ) : (
              <>
                <input
                  ref={refFileRef}
                  type="file"
                  accept={acceptTypes}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setRefFile(f);
                    e.target.value = "";
                  }}
                />
                <Button variant="secondary" size="sm" className="w-full gap-1.5" onClick={() => refFileRef.current?.click()}>
                  <Upload size={14} /> Choose audio file
                </Button>
              </>
            )
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

      <Button
        className="w-full gap-2 glow-primary"
        size="lg"
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        {loading ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Analyzing…
          </>
        ) : (
          <>Analyze</>
        )}
      </Button>

      <p className="text-[10px] text-center text-muted-foreground">
        Audio files up to 75 MB each · MP3, WAV, M4A, FLAC supported · Spotify & YouTube links for reference
      </p>
    </div>
  );
}
