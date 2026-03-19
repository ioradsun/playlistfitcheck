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

      {/* Content — compact horizontal strip */}
      <div className="relative z-10 flex items-center gap-3 px-3 py-2.5">

        {/* Cover thumbnail */}
        {coverArtUrl && (
          <div
            className="z-20 flex-shrink-0 overflow-hidden rounded-md shadow-lg"
            style={{
              width: 36,
              height: 36,
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

        {/* Headline + CTA inline */}
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[11px] sm:text-[12.5px] font-medium leading-snug"
            style={{ color: "rgba(255,255,255,0.78)" }}
          >
            {headline}
          </p>
          <span
            className="mt-1 inline-block rounded border border-white/[0.18] px-2.5 py-1 text-[10px] sm:text-[11px] font-semibold text-white/90 backdrop-blur-sm"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            Claim Free Account
          </span>
        </div>
      </div>
    </div>
  );
}
