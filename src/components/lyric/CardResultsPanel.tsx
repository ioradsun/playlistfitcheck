import { useMemo, useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import type { Moment } from "@/lib/buildMoments";
import { deriveMomentFireCounts } from "@/lib/momentUtils";
import { buildShareUrl, parseLyricDanceUrl } from "@/lib/shareUrl";

interface Props {
  moments: Moment[];
  reactionData: Record<string, { line: Record<number, number>; total: number }>;
  spotifyTrackId: string | null;
  postId: string | null;
  lyricDanceUrl: string | null;
}

function Label({ children }: { children: string }) {
  return (
    <p style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
      {children}
    </p>
  );
}

const ROW_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: 36,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 10,
  padding: "0 10px",
} as const;

export function CardResultsPanel({
  moments,
  reactionData,
  spotifyTrackId,
  postId,
  lyricDanceUrl,
}: Props) {
  const [copied, setCopied] = useState(false);

  const parsed = lyricDanceUrl ? parseLyricDanceUrl(lyricDanceUrl) : null;
  const shareUrl = parsed
    ? buildShareUrl(parsed.artistSlug, parsed.songSlug)
    : postId
      ? `${window.location.origin}/song/${postId}`
      : null;

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const { momentFireCounts, maxFire, totalFires, hottestIdx } = useMemo(() => {
    const momentFireCounts = deriveMomentFireCounts(reactionData, moments);
    const maxFire = Math.max(1, ...Object.values(momentFireCounts));
    const totalFires = Object.values(reactionData).reduce(
      (s, v) => s + (v.total ?? 0), 0,
    );
    const hottestIdx = moments.length > 0
      ? moments.reduce(
        (bestIdx, _, i) =>
          (momentFireCounts[i] ?? 0) > (momentFireCounts[bestIdx] ?? 0)
            ? i
            : bestIdx,
        0,
      )
      : null;
    return { momentFireCounts, maxFire, totalFires, hottestIdx };
  }, [moments, reactionData]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        overflowX: "hidden",
        background: "#0a0a0a",
        padding: 0,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          marginLeft: "auto",
          marginRight: "auto",
          padding: "0 14px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          fontFamily: "monospace",
        }}
      >
        {shareUrl && (
          <div>
            <Label>share</Label>
            <div style={ROW_STYLE}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>tools.fm</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {shareUrl}
              </span>
              <button
                onClick={handleCopy}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: copied ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.25)",
                  display: "flex",
                  alignItems: "center",
                  transition: "color 150ms",
                  padding: 4,
                  flexShrink: 0,
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          </div>
        )}

        {spotifyTrackId && (
        <div>
          <Label>listen</Label>
          <a
            href={`https://open.spotify.com/track/${spotifyTrackId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...ROW_STYLE, textDecoration: "none", cursor: "pointer" }}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="rgba(255,255,255,0.3)">
              <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.5 17.34a.75.75 0 0 1-1.03.24c-2.81-1.72-6.34-2.11-10.5-1.15a.75.75 0 1 1-.34-1.46c4.54-1.04 8.43-.61 11.63 1.35a.75.75 0 0 1 .24 1.02zm1.47-3.26a.94.94 0 0 1-1.29.31c-3.22-1.98-8.12-2.55-11.93-1.37a.94.94 0 0 1-.56-1.8c4.17-1.3 9.53-.66 13.48 1.74.44.27.58.84.3 1.12zm.13-3.4C15.56 8.6 9.73 8.42 6.36 9.43a1.13 1.13 0 0 1-.66-2.16c3.87-1.18 10.31-.95 14.55 1.59a1.13 1.13 0 1 1-1.16 1.82z" />
            </svg>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", flex: 1 }}>Open in Spotify</span>
            <ExternalLink size={11} style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0 }} />
          </a>
        </div>
        )}

        {moments.length > 0 && (
        <div>
          <Label>fire moments</Label>
          <div style={{ display: "flex", gap: 2, height: 32, alignItems: "flex-end" }}>
            {moments.map((_, i) => {
              const count = momentFireCounts[i] ?? 0;
              const pct = count / maxFire;
              const isHottest = pct === 1 && count > 0;
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${Math.max(15, Math.round(pct * 100))}%`,
                    borderRadius: 2,
                    background: isHottest
                      ? "rgba(255,255,255,0.4)"
                      : pct > 0.6
                        ? "rgba(255,255,255,0.2)"
                        : pct > 0.2
                          ? "rgba(255,255,255,0.1)"
                          : pct > 0
                            ? "rgba(255,255,255,0.06)"
                            : "rgba(255,255,255,0.03)",
                    transition: "height 300ms ease, background 300ms ease",
                  }}
                />
              );
            })}
          </div>
        </div>
        )}

        {totalFires > 0 && (
        <div>
          <Label>crowd signal</Label>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 20, color: "rgba(255,255,255,0.7)", fontFamily: "monospace" }}>
              {totalFires.toLocaleString()}
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>🔥</span>
          </div>
          {hottestIdx !== null && moments[hottestIdx] && (
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 3 }}>
              hottest · {moments[hottestIdx]?.label ?? `moment ${hottestIdx + 1}`}
            </p>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
