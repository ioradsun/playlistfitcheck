interface PlayerHeaderProps {
  avatarUrl?: string | null;
  artistName?: string;
  songTitle: string;
  spotifyTrackId?: string | null;
}

export function PlayerHeader({ avatarUrl, artistName, songTitle, spotifyTrackId }: PlayerHeaderProps) {
  return (
    <div
      style={{
        height: 44,
        background: "#0a0a0f",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 10px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        fontFamily: "monospace",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", minWidth: 0, gap: 8 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : null}
        </div>

        <div style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {artistName && (
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{artistName}</span>
          )}
          {artistName && <span style={{ margin: "0 4px", color: "rgba(255,255,255,0.5)" }}>·</span>}
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>{songTitle}</span>
        </div>
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
            flexShrink: 0,
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
          <span style={{ fontSize: 9, color: "rgba(30,215,96,0.7)", fontWeight: 500, letterSpacing: "0.04em" }}>
            LISTEN
          </span>
        </a>
      )}
    </div>
  );
}
