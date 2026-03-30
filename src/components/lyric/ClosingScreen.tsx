import { useMemo, useState } from "react";
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
}

const FALLBACK_FEELINGS = [
  "relief",
  "power",
  "seen",
  "pain that needed to come out",
  "something I can't name yet",
];

export function ClosingScreen({ visible, empowermentPromise, danceId, onReplay, onAnswer }: ClosingScreenProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const [freeText, setFreeText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const options = useMemo(() => (
    empowermentPromise?.hooks.length
      ? [...empowermentPromise.hooks, "none of these — it missed me"]
      : FALLBACK_FEELINGS
  ), [empowermentPromise]);

  const handleSubmit = async (hookIndex: number | null, text: string) => {
    if (submitted) return;
    setSubmitted(true);
    await emitClosingPick(danceId, hookIndex, text || null);
    if (hookIndex !== null && hookIndex < options.length - 1) {
      setConfirmText(options[hookIndex]);
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 200,
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
          padding: "28px 24px",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontFamily: "monospace",
            color: "rgba(255,255,255,0.22)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>{empowermentPromise?.fromState ?? "before"}</span>
          <span style={{ opacity: 0.4 }}>→</span>
          <span style={{ color: "#a855f7", opacity: 0.7 }}>{empowermentPromise?.toState ?? "after"}</span>
        </div>

        <p
          style={{
            fontSize: 15,
            fontWeight: 500,
            color: "rgba(255,255,255,0.82)",
            textAlign: "center",
            marginBottom: 20,
            lineHeight: 1.4,
            fontFamily: "monospace",
            maxWidth: 260,
          }}
        >
          which of these just happened to you?
        </p>

        {!submitted ? (
          <>
            <div
              style={{
                width: "100%",
                maxWidth: 300,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setPicked(i);
                    onAnswer?.();
                    handleSubmit(i, freeText);
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: picked === i ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.04)",
                    border: `0.5px solid ${picked === i ? "rgba(168,85,247,0.4)" : "rgba(255,255,255,0.08)"}`,
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: picked === i
                      ? "rgba(255,255,255,0.9)"
                      : "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                    textAlign: "left",
                    lineHeight: 1.45,
                    transition: "all 0.15s",
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>

            <div style={{ width: "100%", maxWidth: 300, marginTop: 10 }}>
              <input
                type="text"
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && freeText.trim()) {
                    onAnswer?.();
                    handleSubmit(picked, freeText);
                  }
                }}
                placeholder="or say it yourself..."
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  background: "rgba(255,255,255,0.04)",
                  border: "0.5px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  fontSize: 11,
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
                    handleSubmit(picked, freeText);
                  }}
                  style={{
                    marginTop: 6,
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
          <div style={{ textAlign: "center" }}>
            {confirmText && (
              <p
                style={{
                  fontSize: 16,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.88)",
                  fontFamily: "monospace",
                  marginBottom: 12,
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
                marginBottom: 24,
              }}
            >
              that matters.
            </p>
          </div>
        )}

        <button
          onClick={onReplay}
          style={{
            marginTop: submitted ? 0 : 20,
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
