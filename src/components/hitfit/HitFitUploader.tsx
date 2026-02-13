import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Upload, X, Disc3, Music, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onAnalyze: (master1: File, master2: File | null, reference: File) => void;
  loading: boolean;
}

interface FileSlot {
  label: string;
  description: string;
  icon: React.ElementType;
  required: boolean;
  file: File | null;
}

export function HitFitUploader({ onAnalyze, loading }: Props) {
  const [slots, setSlots] = useState<FileSlot[]>([
    { label: "Master A", description: "Your primary mastered track", icon: Disc3, required: true, file: null },
    { label: "Master B", description: "Optional second master to compare", icon: Disc3, required: false, file: null },
    { label: "Reference", description: "A released track with the sound you're targeting", icon: Music, required: true, file: null },
  ]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null]);

  const setFile = (index: number, file: File | null) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, file } : s)));
  };

  const canSubmit = slots[0].file && slots[2].file && !loading;

  const handleSubmit = () => {
    if (!slots[0].file || !slots[2].file) return;
    onAnalyze(slots[0].file, slots[1].file, slots[2].file);
  };

  const acceptTypes = ".mp3,.wav,.m4a,.aac,.ogg,.flac,.aiff,.wma";

  return (
    <motion.div
      className="w-full max-w-xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">HitFit</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Upload your master(s) and a reference track. AI will analyze and compare the sonics, telling you exactly how to bridge the gap.
        </p>
      </div>

      <div className="space-y-3">
        {slots.map((slot, i) => {
          const Icon = slot.icon;
          return (
            <div
              key={i}
              className={`glass-card rounded-xl p-4 transition-all ${
                slot.file ? "border-primary/30" : "border-border"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon size={18} className="text-primary" />
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
                    <p className="text-xs text-muted-foreground">{slot.description}</p>
                  )}
                </div>
                {slot.file ? (
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setFile(i, null)}>
                    <X size={16} />
                  </Button>
                ) : (
                  <>
                    <input
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="file"
                      accept={acceptTypes}
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setFile(i, f);
                        e.target.value = "";
                      }}
                    />
                    <Button variant="secondary" size="sm" className="shrink-0 gap-1.5" onClick={() => inputRefs.current[i]?.click()}>
                      <Upload size={14} /> Choose
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Button
        className="w-full gap-2"
        size="lg"
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        {loading ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Analyzing masters…
          </>
        ) : (
          <>Analyze Masters</>
        )}
      </Button>

      <p className="text-[10px] text-center text-muted-foreground">
        Audio files up to 20 MB each · MP3, WAV, M4A, FLAC supported
      </p>
    </motion.div>
  );
}
