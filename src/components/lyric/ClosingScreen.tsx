import { useEffect, useMemo, useRef, useState } from "react";
import { emitClosingPick } from "@/lib/fire";

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
  source?: "feed" | "shareable" | "embed";
}

const FALLBACK_FEELINGS = [
  "relief",
  "power",
  "seen",
  "pain that needed to come out",
  "something I can't name yet",
];

const GAP = "clamp(4px, 2.5cqh, 14px)";

export function ClosingScreen({ visible, empowermentPromise, danceId, onReplay, onAnswer, source }: ClosingScreenProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const [freeText, setFreeText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isWide, setIsWide] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setIsWide(width > height || width > 380);
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const options = useMemo(() => (
    empowermentPromise?.hooks.length
      ? empowermentPromise.hooks.slice(0, 4)
      : FALLBACK_FEELINGS
  ), [empowermentPromise]);

  const handleSubmit = async (hookIndex: number | null, text: string) => {
    if (submitted) return;
    setSubmitted(true);
    await emitClosingPick(danceId, hookIndex, text || null, source);
    if (hookIndex !== null) {
      setConfirmText(options[hookIndex]);
    }
  };

  return (
    <div
      ref={rootRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 200,
        containerType: "size",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.25s ease, pointer-events 0.25s ease",
      }}
    >
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "clamp(10px, 4cqh, 28px) 24px",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontFamily: "monospace",
            color: "rgba(255,255,255,0.22)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: GAP,
          }}
        >
          <span>{empowermentPromise?.fromState ?? "before"}</span>
          <span style={{ opacity: 0.4 }}>→</span>
          <span style={{ color: "#a855f7", opacity: 0.7 }}>{empowermentPromise?.toState ?? "after"}</span>
        </div>

        <p
          style={{
            fontSize: "clamp(11px, 2.8cqh, 15px)",
            fontWeight: 500,
            color: "rgba(255,255,255,0.82)",
            textAlign: "center",
            lineHeight: 1.4,
            fontFamily: "monospace",
            maxWidth: 260,
            margin: 0,
            marginBottom: GAP,
          }}
        >
          what did this just do to you?
        </p>

        {!submitted ? (
          <>
            <div
              style={{
                width: "100%",
                maxWidth: 300,
                display: "grid",
                gridTemplateColumns: isWide ? "1fr 1fr" : "1fr",
                gap: "clamp(3px, 1.2cqh, 6px)",
                marginBottom: GAP,
              }}
            >
              {options.map((opt, i) => {
                const isLast = i === options.length - 1;
                const isOptOut = isWide && isLast;
                return (
                <button
                  key={i}
                  onClick={() => {
                    setPicked(i);
                    onAnswer?.();
                    handleSubmit(i, freeText);
                  }}
                  style={{
                    width: "100%",
                    padding: "clamp(5px, 1.8cqh, 10px) 14px",
                    borderRadius: 10,
                    background: picked === i ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.04)",
                    border: `0.5px solid ${isOptOut ? "rgba(255,255,255,0.06)" : picked === i ? "rgba(168,85,247,0.4)" : "rgba(255,255,255,0.08)"}`,
                    fontSize: "clamp(9px, 2cqh, 11px)",
                    fontFamily: "monospace",
                    color: picked === i
                      ? "rgba(255,255,255,0.9)"
                      : isOptOut ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.5)",
                    opacity: isOptOut ? 0.8 : 1,
                    cursor: "pointer",
                    textAlign: "left",
                    lineHeight: 1.45,
                    transition: "all 0.15s",
                    gridColumn: isOptOut ? "1 / -1" : undefined,
                  }}
                >
                  {opt}
                </button>
                );
              })}
            </div>

            <div style={{ width: "100%", maxWidth: 300, marginBottom: GAP }}>
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
                placeholder="or say it in your own words..."
                style={{
                  width: "100%",
                  padding: "clamp(5px, 1.8cqh, 10px) 12px",
                  background: "rgba(255,255,255,0.04)",
                  border: "0.5px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  fontSize: "clamp(9px, 2cqh, 11px)",
                  fontFamily: "monospace",
                  color: "rgba(255,255,255,0.7)",
                  outline: "none",
                  caretColor: "#a855f7",
                }}
              />
              {freeText.trim().length > 0 && (
                <button
                  onClick={() => {
                    onAnswer?.();
                    handleSubmit(null, freeText);
                  }}
                  style={{
                    marginTop: "clamp(3px, 1.2cqh, 6px)",
                    fontSize: 9,
                    fontFamily: "monospace",
                    color: "rgba(168,85,247,0.7)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    letterSpacing: "0.1em",
                  }}
                >
                  submit →
                </button>
              )}
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", marginBottom: GAP }}>
            {confirmText && (
              <p
                style={{
                  fontSize: "clamp(12px, 3cqh, 16px)",
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.88)",
                  fontFamily: "monospace",
                  margin: "0 auto",
                  marginBottom: "clamp(4px, 1.5cqh, 12px)",
                  lineHeight: 1.4,
                  maxWidth: 260,
                }}
              >
                "{confirmText}"
              </p>
            )}
            <p
              style={{
                fontSize: 10,
                fontFamily: "monospace",
                color: "rgba(168,85,247,0.5)",
                margin: 0,
                marginTop: "clamp(4px, 1.5cqh, 10px)",
              }}
            >
              felt that.
            </p>
          </div>
        )}

        <button
          onClick={onReplay}
          style={{
            fontSize: 9,
            fontFamily: "monospace",
            color: "rgba(255,255,255,0.18)",
            background: "none",
            border: "none",
            cursor: "pointer",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          ↩ replay
        </button>
      </div>
    </div>
  );
}
