import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Music, Waves } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Position anchor: "header" (standard feed) | "floating" (reels) */
  anchor?: "header" | "floating";
}

export function PlusMenu({ open, onClose, anchor = "header" }: Props) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  const go = (mode: "song" | "beat") => {
    onClose();
    navigate(`/LyricFit?mode=${mode}`);
  };

  return (
    <div ref={ref} className="relative">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, x: 8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.92, x: 8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 z-[9999] w-40 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
            style={{ top: anchor === "floating" ? "calc(100% + 8px)" : "calc(100% + 4px)" }}
          >
            <button
              onClick={() => go("song")}
              className="flex w-full items-center gap-2.5 border-b border-border/40 px-3.5 py-2.5 text-left text-[13px] font-medium text-popover-foreground/75 transition-colors hover:bg-accent/50"
            >
              <Music size={14} className="shrink-0 text-muted-foreground" />
              song
            </button>
            <button
              onClick={() => go("beat")}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-popover-foreground/75 transition-colors hover:bg-accent/50"
            >
              <Waves size={14} className="shrink-0 text-muted-foreground" />
              beat
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
