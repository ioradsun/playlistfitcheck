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

  const label = !loading && nextNumber
    ? `Founding Artist #${nextNumber}`
    : "Founding Artist";

  return (
    <div
      onClick={handleClaim}
      className="flex-shrink-0 w-full z-[55] relative cursor-pointer overflow-hidden"
      style={{ height: "68px" }}
    >
      {coverArtUrl && (
        <img
          src={coverArtUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          style={{
            filter: "blur(18px) saturate(1.4) brightness(0.55)",
            transform: "scale(1.15)",
            transformOrigin: "center",
          }}
        />
      )}

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: coverArtUrl
            ? `linear-gradient(90deg, ${accent}55 0%, ${accent}22 60%, transparent 100%)`
            : accent,
        }}
      />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: "inset 0 0 30px 4px rgba(0,0,0,0.5)" }}
      />

      <div className="relative z-10 h-full flex items-center gap-3 px-3 sm:px-4 active:opacity-80 transition-opacity">
        {coverArtUrl && (
          <div
            className="flex-shrink-0 rounded-[6px] overflow-hidden border border-white/20 shadow-lg"
            style={{ width: 44, height: 44 }}
          >
            <img
              src={coverArtUrl}
              alt={songName ?? "cover"}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex flex-col min-w-0 flex-1">
          <p className="text-[11px] sm:text-[12px] font-semibold text-white leading-tight tracking-wide">
            {label} of tools<span style={{ color: accent === "#a855f7" ? "#c084fc" : accent }}>FM</span>
          </p>
          <p className="text-[10px] text-white/50 leading-tight mt-0.5 truncate">
            {songName && artistName
              ? `${artistName} · claim your page · free forever`
              : "free forever · built for artists"}
          </p>
        </div>

        <div
          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold text-white border border-white/25 backdrop-blur-sm"
          style={{ background: "rgba(255,255,255,0.12)" }}
        >
          Claim free
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M2 5h6M5.5 2.5 8 5l-2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
  );
}
