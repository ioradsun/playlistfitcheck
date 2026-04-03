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
  onReplay: () => void;
  onAnswer?: () => void;
  onShareClip?: (momentIndex: number, caption: string) => void;
  source?: "feed" | "shareable" | "embed";
  moments?: Moment[];
  momentFireCounts?: Record<number, number>;
  onSeekToMoment?: (momentIndex: number) => void;
}

const FALLBACK_FEELINGS = [
  "relief",
  "power",
  "seen",
  "pain that needed to come out",
  "something I can't name yet",
];

export function ClosingScreen({
  visible,
  empowermentPromise,
  danceId,
  onReplay,
  onAnswer,
  onShareClip,
  source,
  moments,
  momentFireCounts,
  onSeekToMoment,
}: ClosingScreenProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const [freeText, setFreeText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [selectedMomentIdx, setSelectedMomentIdx] = useState<number | null>(null);
  const [activeCaption, setActiveCaption] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const options = useMemo(
    () => (empowermentPromise?.hooks.length ? empowermentPromise.hooks.slice(0, 4) : FALLBACK_FEELINGS),
    [empowermentPromise],
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

  const displayMomentIdx = selectedMomentIdx ?? hottestMomentIdx;

  useEffect(() => {
    if (visible && moments?.length) {
      onSeekToMoment?.(hottestMomentIdx);
      setSelectedMomentIdx(null);
      setActiveCaption("");
      setPicked(null);
      setFreeText("");
      setSubmitted(false);
      setConfirmText("");
    }
  }, [visible, moments, hottestMomentIdx, onSeekToMoment]);

  const handleSubmit = async (hookIndex: number | null, text: string) => {
    if (submitted) return;
    setSubmitted(true);
    await emitClosingPick(danceId, hookIndex, text || null, source);
    if (hookIndex !== null) {
      setConfirmText(options[hookIndex]);
    } else {
      setConfirmText(text.trim());
    }
  };

  const submitSelection = async () => {
    const trimmed = freeText.trim();
    if (picked !== null) {
      await handleSubmit(picked, trimmed);
      return;
    }
    if (trimmed) {
      await handleSubmit(null, trimmed);
    }
  };

  return (
    <div
      ref={rootRef}
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
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 3,
            background: "rgba(255,255,255,0.95)",
            padding: "12px 20px",
            textAlign: "center",
            transition: "all 0.2s ease",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: "#0a0a0a",
              lineHeight: 1.3,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {activeCaption
              ? `this song made me feel ${activeCaption}`
              : "this song made me feel ____"}
          </p>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 2,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 16px 8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.12)",
                }}
              />
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 500 }} />
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)" }} />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  background: "rgba(30,215,96,0.12)",
                  border: "1px solid rgba(30,215,96,0.2)",
                  borderRadius: 14,
                  padding: "3px 8px",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 8, color: "rgba(30,215,96,0.6)" }}>LISTEN</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ fontSize: 10, opacity: 0.5 }}>🔥</span>
                <span
                  style={{
                    fontSize: 9,
                    color: "rgba(255,255,255,0.2)",
                    fontFamily: "monospace",
                  }}
                >
                  {Object.values(momentFireCounts ?? {}).reduce((s, c) => s + c, 0)}
                </span>
              </div>
            </div>
          </div>

          {moments && moments.length > 0 && (
            <div style={{ padding: "0 12px 8px", display: "flex", gap: 2, alignItems: "center" }}>
              {moments.map((moment, index) => {
                const fires = momentFireCounts?.[index] ?? 0;
                const maxFires = Math.max(1, ...Object.values(momentFireCounts ?? {}));
                const heat = maxFires > 0 ? fires / maxFires : 0;
                const isSelected = index === displayMomentIdx;
                const flex = Math.max(1, moment.endSec - moment.startSec);

                const r = Math.round(160 + heat * 80);
                const g = Math.round(90 + heat * 60);
                const b = 20;
                const opacity = 0.15 + heat * 0.7;

                return (
                  <button
                    key={`${moment.startSec}-${moment.endSec}-${index}`}
                    type="button"
                    onClick={() => {
                      setSelectedMomentIdx(index);
                      onSeekToMoment?.(index);
                    }}
                    style={{
                      flex,
                      height: 4,
                      background: `rgb(${r},${g},${b})`,
                      opacity,
                      borderRadius: 3,
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      outline: isSelected ? "1.5px solid rgba(255,180,40,0.50)" : "none",
                      outlineOffset: isSelected ? 2 : 0,
                      transition: "opacity 0.3s ease",
                    }}
                  />
                );
              })}
            </div>
          )}

          <div
            style={{
              padding: "0 16px 6px",
              fontSize: 7,
              color: "rgba(255,255,255,0.10)",
              fontFamily: "monospace",
              letterSpacing: "0.05em",
            }}
          >
            Fit by toolsFM
          </div>
        </div>
      </div>

      <div
        style={{
          background: "#0a0a0f",
          padding: "14px 20px 20px",
          flexShrink: 0,
        }}
      >
        {!submitted ? (
          <>
            <p
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.32)",
                textAlign: "center",
                margin: "0 0 12px",
              }}
            >
              this song made me feel
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 7,
                justifyContent: "center",
                marginBottom: 14,
              }}
            >
              {options.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setPicked(i);
                    setActiveCaption(opt);
                    setFreeText("");
                  }}
                  style={{
                    background: picked === i ? "rgba(255,140,20,0.18)" : "rgba(255,140,20,0.05)",
                    border: `1px solid ${picked === i ? "rgba(255,140,20,0.40)" : "rgba(255,140,20,0.10)"}`,
                    borderRadius: 20,
                    padding: "8px 16px",
                    color: picked === i ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.45)",
                    fontSize: 12,
                    fontFamily: "monospace",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={freeText}
              onChange={(e) => {
                const nextValue = e.target.value;
                setFreeText(nextValue);
                if (nextValue.trim()) {
                  setActiveCaption(nextValue);
                  setPicked(null);
                } else if (picked !== null) {
                  setActiveCaption(options[picked] ?? "");
                } else {
                  setActiveCaption("");
                }
              }}
              placeholder="or say it your way..."
              style={{
                width: "100%",
                padding: "9px 12px",
                background: "rgba(255,255,255,0.03)",
                border: "0.5px solid rgba(255,255,255,0.08)",
                borderRadius: 10,
                fontSize: 12,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.6)",
                outline: "none",
                caretColor: "rgba(255,160,40,0.6)",
                marginBottom: 12,
                boxSizing: "border-box",
              }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              {activeCaption ? (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      onAnswer?.();
                      await submitSelection();
                      onShareClip?.(displayMomentIdx, activeCaption.trim());
                    }}
                    style={{
                      flex: 1,
                      background: "rgba(255,140,20,0.12)",
                      border: "1px solid rgba(255,140,20,0.25)",
                      borderRadius: 10,
                      padding: 10,
                      color: "rgba(255,170,50,0.8)",
                      fontSize: 12,
                      fontWeight: 500,
                      fontFamily: "monospace",
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    share clip
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      onAnswer?.();
                      await submitSelection();
                      onReplay();
                    }}
                    style={{
                      flex: 1,
                      background: "rgba(255,255,255,0.03)",
                      border: "0.5px solid rgba(255,255,255,0.08)",
                      borderRadius: 10,
                      padding: 10,
                      color: "rgba(255,255,255,0.25)",
                      fontSize: 12,
                      fontFamily: "monospace",
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    replay
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onReplay}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.03)",
                    border: "0.5px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    padding: 10,
                    color: "rgba(255,255,255,0.25)",
                    fontSize: 12,
                    fontFamily: "monospace",
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  replay
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p
              style={{
                fontSize: 14,
                color: "rgba(255,170,50,0.6)",
                fontStyle: "italic",
                fontFamily: "monospace",
                textAlign: "center",
                margin: "0 0 4px",
              }}
            >
              "{confirmText || freeText}"
            </p>
            <p
              style={{
                fontSize: 10,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.18)",
                textAlign: "center",
                margin: "0 0 14px",
              }}
            >
              felt that.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => onShareClip?.(displayMomentIdx, activeCaption.trim())}
                style={{
                  flex: 1,
                  background: "rgba(255,140,20,0.12)",
                  border: "1px solid rgba(255,140,20,0.25)",
                  borderRadius: 10,
                  padding: 10,
                  color: "rgba(255,170,50,0.8)",
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                share clip
              </button>
              <button
                type="button"
                onClick={onReplay}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.03)",
                  border: "0.5px solid rgba(255,255,255,0.08)",
                  borderRadius: 10,
                  padding: 10,
                  color: "rgba(255,255,255,0.25)",
                  fontSize: 12,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                replay
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
