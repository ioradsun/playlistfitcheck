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
    <div ref={ref} style={{ position: "relative" }}>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, x: 8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.92, x: 8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{
              position: "absolute",
              right: 0,
              top: anchor === "floating" ? "calc(100% + 8px)" : "calc(100% + 4px)",
              width: 160,
              background: "#111",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              zIndex: 9999,
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => go("song")}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "11px 14px",
                background: "none",
                border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                cursor: "pointer",
                textAlign: "left",
                color: "rgba(255,255,255,0.75)",
                fontSize: 13,
                fontWeight: 500,
                transition: "background 120ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <Music size={14} style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }} />
              song
            </button>
            <button
              onClick={() => go("beat")}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "11px 14px",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                color: "rgba(255,255,255,0.75)",
                fontSize: 13,
                fontWeight: 500,
                transition: "background 120ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <Waves size={14} style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }} />
              beat
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
