import { useEffect, useMemo, useRef, useState } from "react";
import { emitClosingPick } from "@/lib/fire";
import type { Moment } from "@/lib/buildMoments";

interface ClosingScreenProps {
  visible: boolean;
  empowermentPromise: {
    fromState: string;
    toState: string;
    promise: string;
    hooks: string[];
  } | null;
  danceId: string;
  onLoopMoment?: (momentIndex: number) => void;
  source?: "feed" | "shareable" | "embed";
  moments?: Moment[];
  momentFireCounts?: Record<number, number>;
  onSeekToMoment?: (momentIndex: number) => void;
  /** Currently active moment index — updated by parent when user browses via the moment strip */
  activeMomentIdx?: number;
}

const FALLBACK_FEELINGS = [
  "something I needed to hear",
  "seen in a way I can't explain",
  "ready to move different",
];

export function ClosingScreen({
  visible,
  empowermentPromise,
  danceId,
  onLoopMoment,
  source,
  moments,
  momentFireCounts,
  onSeekToMoment,
  activeMomentIdx,
}: ClosingScreenProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const [freeText, setFreeText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [browsedMomentIdx, setBrowsedMomentIdx] = useState<number>(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | "free" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(
    () => (empowermentPromise?.hooks.length ? empowermentPromise.hooks.slice(0, 3) : FALLBACK_FEELINGS),
    [empowermentPromise],
  );

  const hasFires = useMemo(
    () => Object.values(momentFireCounts ?? {}).some((count) => count > 0),
    [momentFireCounts],
  );

  const hottestMomentIdx = useMemo(() => {
    if (!momentFireCounts || !moments?.length) return 0;
    let maxFires = 0;
    let maxIdx = 0;
    for (let i = 0; i < moments.length; i += 1) {
      const fires = momentFireCounts[i] ?? 0;
      if (fires > maxFires) {
        maxFires = fires;
        maxIdx = i;
      }
    }
    return maxIdx;
  }, [moments, momentFireCounts]);

  useEffect(() => {
    if (!visible) return;
    setPicked(null);
    setFreeText("");
    setSubmitted(false);
    setBrowsedMomentIdx(activeMomentIdx ?? 0);

    if (hasFires && moments?.length) {
      onSeekToMoment?.(hottestMomentIdx);
    }
  }, [visible, hasFires, hottestMomentIdx, moments, onSeekToMoment, activeMomentIdx]);

  useEffect(() => {
    if (!visible) return;
    if (typeof activeMomentIdx === "number") {
      setBrowsedMomentIdx(activeMomentIdx);
    }
  }, [activeMomentIdx, visible]);

  const handleSubmit = async (hookIndex: number | null, text: string) => {
    if (submitted) return;
    setSubmitted(true);
    await emitClosingPick(danceId, hookIndex, text || null, source);
  };

  const handleMomentLoop = async () => {
    const trimmed = freeText.trim();
    if (!submitted) {
      if (picked !== null) {
        await handleSubmit(picked, "");
      } else if (trimmed) {
        await handleSubmit(null, trimmed);
      }
    }

    if (hasFires) {
      onLoopMoment?.(hottestMomentIdx);
      return;
    }

    onLoopMoment?.(browsedMomentIdx ?? 0);
  };

  const isFreeTextSelected = picked === null && freeText.trim().length > 0;

  return (
    <>
      <style>{`.closing-free-input::placeholder { color: rgba(255,255,255,0.18); }`}</style>
      <div
        style={{
        position: "absolute",
        inset: 0,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.3s ease",
      }}
    >
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            pointerEvents: "none",
          }}
        />
      </div>

      <div
        style={{
          flexShrink: 0,
          background: "#0a0a0f",
          padding: "14px 16px calc(16px + env(safe-area-inset-bottom, 0px))",
          overflowY: "auto",
          maxHeight: "55vh",
        }}
      >
        <p
          style={{
            margin: "0 0 10px",
            fontSize: 11,
            fontFamily: "monospace",
            color: "rgba(255,255,255,0.25)",
            textAlign: "center",
            textTransform: "lowercase",
          }}
        >
          which one hits?
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {options.map((opt, i) => {
            const selected = picked === i;
            const hovered = hoveredIdx === i;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setPicked(i)}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx((prev) => (prev === i ? null : prev))}
                style={{
                  width: "100%",
                  background: selected
                    ? "rgba(255,140,20,0.08)"
                    : hovered
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(255,255,255,0.03)",
                  border: `1px solid ${selected ? "rgba(255,140,20,0.25)" : hovered ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: selected ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)",
                  lineHeight: 1.45,
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {opt}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => inputRef.current?.focus()}
            onMouseEnter={() => setHoveredIdx("free")}
            onMouseLeave={() => setHoveredIdx((prev) => (prev === "free" ? null : prev))}
            style={{
              width: "100%",
              background: isFreeTextSelected
                ? "rgba(255,140,20,0.08)"
                : hoveredIdx === "free"
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(255,255,255,0.03)",
              border: `1px solid ${isFreeTextSelected ? "rgba(255,140,20,0.25)" : hoveredIdx === "free" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)"}`,
              borderRadius: 10,
              padding: "10px 14px",
              transition: "all 0.2s ease",
              cursor: "pointer",
            }}
          >
            <input
              className="closing-free-input"
              ref={inputRef}
              type="text"
              value={freeText}
              onChange={(e) => {
                const next = e.target.value;
                setFreeText(next);
                if (next.trim()) {
                  setPicked(null);
                }
              }}
              placeholder="say it your way..."
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                width: "100%",
                textAlign: "center",
                fontSize: 11,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.85)",
                caretColor: "rgba(255,160,40,0.6)",
              }}
            />
          </button>
        </div>

        <button
          type="button"
          onClick={handleMomentLoop}
          style={{
            marginTop: 12,
            width: "100%",
            background: "rgba(255,140,20,0.10)",
            border: "1px solid rgba(255,140,20,0.20)",
            borderRadius: 10,
            padding: 12,
            fontSize: 12,
            fontWeight: 500,
            fontFamily: "monospace",
            color: "rgba(255,170,50,0.7)",
            textAlign: "center",
            cursor: "pointer",
            textTransform: "lowercase",
          }}
        >
          {hasFires ? "your 🔥 moment" : "pick your 🔥 moment"}
        </button>
      </div>
    </div>
    </>
  );
}
