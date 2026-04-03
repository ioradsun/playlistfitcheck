import type { ReactNode } from "react";

interface CanvasTopPillsProps {
  spotifyTrackId?: string | null;
  className?: string;
  leftSlot?: ReactNode;
}

export function CanvasTopPills({ spotifyTrackId, className, leftSlot }: CanvasTopPillsProps) {
  return (
    <div
      className={className}
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        zIndex: 15,
        display: "flex",
        alignItems: "center",
        gap: 6,
        pointerEvents: "auto",
      }}
    >
      {leftSlot}

      <div
        style={{
          background: "rgba(0,0,0,0.35)",
          borderRadius: 14,
          padding: "4px 10px",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "rgba(74,222,128,0.6)",
          }}
        />
        <span
          style={{
            fontSize: 9,
            color: "rgba(74,222,128,0.7)",
            fontFamily: "monospace",
            letterSpacing: "0.08em",
            fontWeight: 500,
          }}
        >
          IN STUDIO
        </span>
      </div>

      {spotifyTrackId && (
        <a
          href={`https://open.spotify.com/track/${spotifyTrackId}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "rgba(0,0,0,0.35)",
            borderRadius: 14,
            padding: "4px 10px 4px 7px",
            display: "flex",
            alignItems: "center",
            gap: 4,
            textDecoration: "none",
          }}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" style={{ flexShrink: 0 }}>
            <path
              fill="rgba(30,215,96,0.8)"
              d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521
              17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122
              -.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42
              .18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159
              -2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6
              9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2z"
            />
          </svg>
          <span
            style={{
              fontSize: 9,
              color: "rgba(30,215,96,0.7)",
              fontWeight: 500,
              letterSpacing: "0.04em",
            }}
          >
            LISTEN
          </span>
        </a>
      )}
    </div>
  );
}
