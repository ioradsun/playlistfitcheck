import { useFmlyNumber } from "@/hooks/useFmlyNumber";
import { useNavigate } from "react-router-dom";

interface ClaimBannerProps {
  artistSlug?: string;
  accent?: string;
}

export default function ClaimBanner({
  artistSlug,
  accent = "#a855f7",
}: ClaimBannerProps) {
  const navigate = useNavigate();
  const { nextNumber, loading } = useFmlyNumber();

  const handleClaim = () => {
    navigate("/auth", {
      state: { claimSlug: artistSlug, returnTab: "CrowdFit" },
    });
  };

  return (
    <div
      className="flex-shrink-0 w-full z-[55] relative"
      style={{
        background: "rgba(0,0,0,0.92)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex justify-center px-4 py-2.5 max-w-2xl mx-auto">
        <button
          onClick={handleClaim}
          className="w-full max-w-[340px] py-2.5 rounded-lg text-center active:scale-[0.97] transition-transform"
          style={{
            background: accent,
            boxShadow: `0 0 12px ${accent}33`,
          }}
        >
          <p className="text-[12px] sm:text-[13px] font-semibold text-white">
            {!loading && nextNumber
              ? `Become Founding Artist #${nextNumber} of toolsFM`
              : "Become a Founding Artist of toolsFM"}
          </p>
          <p className="text-[10px] text-white/50 mt-0.5">
            free forever · tools built by artists for artists
          </p>
        </button>
      </div>
    </div>
  );
}
