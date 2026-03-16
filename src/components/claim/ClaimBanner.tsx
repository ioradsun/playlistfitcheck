import { useFmlyNumber } from "@/hooks/useFmlyNumber";
import { useNavigate } from "react-router-dom";

interface ClaimBannerProps {
  artistSlug?: string;
  accent?: string;
  coverArtUrl?: string | null;
  songName?: string;
  artistName?: string;
}

export default function ClaimBanner({
  artistSlug,
  accent = "#a855f7",
  coverArtUrl,
  songName,
  artistName,
}: ClaimBannerProps) {
  const navigate = useNavigate();
  const { nextNumber, loading } = useFmlyNumber();

  const handleClaim = () => {
    navigate("/auth", {
      state: { claimSlug: artistSlug, returnTab: "CrowdFit" },
    });
  };

  const displayName = artistName
    ? artistName.split(" ")[0].charAt(0).toUpperCase() + artistName.split(" ")[0].slice(1)
    : null;

  const headline = (() => {
    if (!loading && nextNumber && displayName) {
      return (
        <>
          {displayName}, you could be{" "}
          <span className="text-white">Founding Artist #{nextNumber}</span>
          {" "}of toolsFM
        </>
      );
    }
    if (!loading && nextNumber) {
      return (
        <>
          You could be{" "}
          <span className="text-white">Founding Artist #{nextNumber}</span>
          {" "}of toolsFM
        </>
      );
    }
    return (
      <>
        Become a{" "}
        <span className="text-white">Founding Artist</span>
        {" "}of toolsFM
      </>
    );
  })();

  return (
    <div
      onClick={handleClaim}
      className="flex-shrink-0 w-full z-[55] relative cursor-pointer overflow-hidden active:opacity-90 transition-opacity"
      style={{ height: "68px" }}
    >
      {/* Blurred cover art backdrop */}
      {coverArtUrl ? (
        <img
          src={coverArtUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          style={{
            filter: "blur(22px) saturate(1.2) brightness(0.45)",
            transform: "scale(1.18)",
            transformOrigin: "center",
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: accent }} />
      )}

      {/* Neutral dark scrim — no color tint, lighter over thumbnail zone, darker over text zone */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(90deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 58px, rgba(0,0,0,0.55) 120px, rgba(0,0,0,0.60) 100%)",
        }}
      />

      {/* Top/bottom edge vignette only */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: "inset 0 8px 12px -4px rgba(0,0,0,0.4), inset 0 -8px 12px -4px rgba(0,0,0,0.4)" }}
      />

      {/* Content row */}
      <div className="relative z-10 h-full flex items-center gap-3 px-3 sm:px-4">

        {/* Thumbnail — z-20, above the scrim stack, fully vivid */}
        {coverArtUrl && (
          <div
            className="flex-shrink-0 rounded-[5px] overflow-hidden shadow-lg z-20"
            style={{
              width: 42,
              height: 42,
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            <img
              src={coverArtUrl}
              alt={songName ?? "cover"}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Headline — single line, no subheading */}
        <p
          className="flex-1 min-w-0 text-[11.5px] sm:text-[12.5px] font-medium leading-snug truncate"
          style={{ color: "rgba(255,255,255,0.72)" }}
        >
          {headline}
        </p>

        {/* CTA — transparent pill with play icon */}
        <div
          className="flex-shrink-0 flex items-center gap-2 text-[11px] sm:text-[11.5px] font-semibold text-white/90 border border-white/20 rounded-full px-3 py-1.5 backdrop-blur-sm"
          style={{ background: "transparent" }}
        >
          <svg width="10" height="11" viewBox="0 0 10 11" fill="none" aria-hidden>
            <path d="M2 1.5L9 5.5L2 9.5V1.5Z" fill="currentColor" opacity="0.85" />
          </svg>
          Claim Your Free Artist Account
        </div>
      </div>
    </div>
  );
}
