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
  const containerRef = useRef<HTMLDivElement>(null);

  const [picked, setPicked] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [browsedMomentIdx, setBrowsedMomentIdx] = useState<number>(0);

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
    if (hasFires) {
      onLoopMoment?.(hottestMomentIdx);
      return;
    }

    onLoopMoment?.(browsedMomentIdx ?? 0);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.3s ease",
      }}
    >
        <div style={{ flex: 1, minHeight: 80, position: "relative", overflow: "hidden" }}>
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
          padding: "12px 16px calc(12px + env(safe-area-inset-bottom, 0px))",
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

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {options.slice(0, 3).map((opt, i) => {
            const selected = picked === i;
            const hasSelection = picked !== null;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  setPicked(i);
                  void handleSubmit(i, "");
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  opacity: hasSelection && !selected ? 0.4 : 1,
                  background: selected ? "rgba(255,140,20,0.18)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${selected ? "rgba(255,140,20,0.50)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontSize: 12,
                  fontFamily: "monospace",
                  color: selected ? "rgba(255,255,255,1.0)" : "rgba(255,255,255,0.45)",
                  lineHeight: 1.45,
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "all 0.18s ease",
                }}
              >
                <span style={{ flex: 1 }}>{opt}</span>
                <span style={{ opacity: selected ? 1 : 0 }}>✓</span>
              </button>
            );
          })}
        </div>

          <button
            type="button"
            onClick={handleMomentLoop}
            style={{
              marginTop: 12,
              width: "100%",
              background: "rgba(255,140,20,0.14)",
              border: "1px solid rgba(255,140,20,0.30)",
              borderRadius: 10,
              padding: 12,
              fontSize: 12,
              fontWeight: 500,
              fontFamily: "monospace",
              color: "rgba(255,170,50,0.9)",
              textAlign: "center",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            Your 🔥 Moment
          </button>
      </div>
    </div>
  );
}
