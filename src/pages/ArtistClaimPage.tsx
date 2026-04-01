import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { consumeClaimPageResolution } from "@/lib/prefetch";

export default function ArtistClaimPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const resolution = consumeClaimPageResolution();
    if (!resolution) {
      navigate("/create", { replace: true });
      return;
    }

    resolution.then((result) => {
      if (!result?.lyricDanceUrl) {
        navigate("/create", { replace: true });
        return;
      }
      const separator = result.lyricDanceUrl.includes("?") ? "&" : "?";
      navigate(`${result.lyricDanceUrl}${separator}from=claim`, { replace: true });
    });
  }, [navigate]);

  return <div className="fixed inset-0 bg-[#0a0a0a]" />;
}
