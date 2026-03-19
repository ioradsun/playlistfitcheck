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
          {displayName}, be toolsFM's{" "}
          <span className="font-semibold text-white">Founding Artist #{nextNumber}</span>
        </>
      );
    }
    if (!loading && nextNumber) {
      return (
        <>
          Be toolsFM's{" "}
          <span className="font-semibold text-white">Founding Artist #{nextNumber}</span>
        </>
      );
    }
    return (
      <>
        Be a toolsFM{" "}
        <span className="font-semibold text-white">Founding Artist</span>
      </>
    );
  })();

  return (
    <div
      onClick={handleClaim}
      className="flex-shrink-0 w-full z-[55] relative cursor-pointer overflow-hidden active:opacity-90 transition-opacity"
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

      {/* Neutral dark scrim — lighter over thumbnail zone, darker over text */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(90deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 58px, rgba(0,0,0,0.55) 120px, rgba(0,0,0,0.60) 100%)",
        }}
      />

      {/* Top/bottom edge vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: "inset 0 8px 12px -4px rgba(0,0,0,0.4), inset 0 -8px 12px -4px rgba(0,0,0,0.4)" }}
      />

      {/* Content — left-aligned on mobile, centered on desktop */}
      <div className="relative z-10 flex items-center gap-2.5 px-3 py-2 sm:justify-center sm:px-5">
        {/* Album art thumbnail */}
        {coverArtUrl && (
          <div
            className="z-20 flex-shrink-0 overflow-hidden rounded shadow-lg"
            style={{
              width: 32,
              height: 32,
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <img
              src={coverArtUrl}
              alt={songName ?? "cover"}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        {/* Headline */}
        <p
          className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight sm:flex-initial sm:text-[12.5px] sm:truncate-none"
          style={{ color: "rgba(255,255,255,0.7)" }}
        >
          {headline}
        </p>

        {/* Claim CTA */}
        <div
          className="flex-shrink-0 rounded-md border border-white/[0.2] px-2.5 py-1.5 text-[10px] font-bold text-white/90 backdrop-blur-sm sm:px-3.5 sm:py-2 sm:text-[11px]"
          style={{ background: "rgba(255,255,255,0.08)" }}
        >
          Claim Spot
        </div>
      </div>
    </div>
  );
}
