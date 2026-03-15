import { useNavigate } from "react-router-dom";
import SpotifyArtistInput from "@/components/SpotifyArtistInput";

export default function CreateArtistPage() {
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 bg-[#050508] flex flex-col items-center justify-center px-6">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%," +
            "rgba(168,85,247,0.14) 0%,transparent 70%)",
        }}
      />
      <div className="relative z-10 w-full max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-white/25 mb-4">tools.fm</p>
        <h1 className="text-3xl font-bold text-white mb-2">Your music. Your page.</h1>
        <p className="text-white/40 text-sm mb-8">
          Paste a Spotify track and we&apos;ll build it in seconds.
        </p>
        <SpotifyArtistInput onSuccess={(slug) => navigate(`/artist/${slug}/claim-page`)} />
      </div>
    </div>
  );
}
