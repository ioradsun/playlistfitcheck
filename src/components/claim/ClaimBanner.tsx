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
      onClick={handleClaim}
      className="flex-shrink-0 w-full z-[55] relative cursor-pointer active:opacity-90 transition-opacity text-center"
      style={{ background: accent, padding: "10px 16px" }}
    >
      <p className="text-[12px] sm:text-[13px] font-semibold text-white">
        {!loading && nextNumber
          ? `Become Founding Artist #${nextNumber} of toolsFM`
          : "Become a Founding Artist of toolsFM"}
      </p>
      <p className="text-[10px] text-white/55 mt-0.5">
        free forever · tools built by artists for artists
      </p>
    </div>
  );
}
