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

  const maxMomentFires = useMemo(
    () => Math.max(1, ...Object.values(momentFireCounts ?? {})),
    [momentFireCounts],
  );

  useEffect(() => {
    if (visible && moments?.length) {
      onSeekToMoment?.(hottestMomentIdx);
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
      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            pointerEvents: "none",
          }}
        />

        {!submitted && (
          <div
            style={{
              position: "absolute",
              bottom: 44,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.4)",
              borderRadius: 20,
              padding: "4px 12px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              zIndex: 1,
            }}
          >
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "rgba(255,160,30,0.8)",
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.45)",
                letterSpacing: "0.03em",
              }}
            >
              hottest moment
            </span>
          </div>
        )}

        {moments && moments.length > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 12,
              right: 12,
              height: 36,
              display: "flex",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: 2, alignItems: "center", width: "100%" }}>
              {moments.map((moment, index) => {
                const fires = momentFireCounts?.[index] ?? 0;
                const heat = fires / maxMomentFires;
                const isHottest = index === hottestMomentIdx;
                const flex = Math.max(1, moment.endSec - moment.startSec);

                const r = Math.round(160 + heat * 80);
                const g = Math.round(90 + heat * 60);
                const b = 20;
                const opacity = 0.15 + heat * 0.7;

                return (
                  <button
                    key={`${moment.startSec}-${moment.endSec}-${index}`}
                    type="button"
                    onClick={() => onSeekToMoment?.(index)}
                    style={{
                      flex,
                      height: 4,
                      background: `rgb(${r},${g},${b})`,
                      opacity,
                      borderRadius: 3,
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      outline: isHottest ? "1.5px solid rgba(255,180,40,0.45)" : "none",
                      outlineOffset: isHottest ? 1.5 : 0,
                      transition: "opacity 0.3s ease",
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}
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
                    onAnswer?.();
                    handleSubmit(i, freeText);
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
              onChange={(e) => setFreeText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && freeText.trim()) {
                  onAnswer?.();
                  handleSubmit(null, freeText);
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

            {freeText.trim().length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onAnswer?.();
                  handleSubmit(null, freeText);
                }}
                style={{
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "rgba(255,160,40,0.6)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  letterSpacing: "0.1em",
                  marginBottom: 12,
                }}
              >
                submit →
              </button>
            )}

            <button
              type="button"
              onClick={onReplay}
              style={{
                width: "100%",
                padding: 10,
                background: "rgba(255,255,255,0.03)",
                border: "0.5px solid rgba(255,255,255,0.08)",
                borderRadius: 10,
                fontSize: 12,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.25)",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              replay
            </button>
          </>
        ) : (
          <>
            {confirmText && (
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
                "{confirmText}"
              </p>
            )}
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
                onClick={() => {
                  const caption = confirmText || freeText || "";
                  onShareClip?.(hottestMomentIdx, caption);
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
