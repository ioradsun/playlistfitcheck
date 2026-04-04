import { SidebarTrigger } from "@/components/ui/sidebar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useFmlyNumber } from "@/hooks/useFmlyNumber";
import { User } from "lucide-react";

interface PlayerHeaderProps {
  avatarUrl?: string | null;
  artistName?: string;
  songTitle: string;
  spotifyTrackId?: string | null;
  showMenuButton?: boolean;
  isVerified?: boolean;
  userId?: string | null;
  onProfileClick?: () => void;
}

function AvatarWithBadges({
  avatarUrl,
  isVerified,
  userId,
  onProfileClick,
}: {
  avatarUrl?: string | null;
  isVerified?: boolean;
  userId?: string | null;
  onProfileClick?: () => void;
}) {
  const { number, isBlazer, loading } = useFmlyNumber(userId);
  const serial = isBlazer && !loading ? String(number).padStart(4, "0") : null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onProfileClick?.();
      }}
      className="relative shrink-0"
    >
      {/* Avatar circle */}
      <div className="h-7 w-7 rounded-full overflow-hidden border border-white/[0.06] bg-white/10 flex items-center justify-center">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <User size={12} className="text-white/40" />
        )}
      </div>

      {/* Verified check — bottom-right of avatar */}
      {isVerified && (
        <span className="absolute -bottom-0.5 -right-0.5 pointer-events-none">
          <VerifiedBadge size={11} />
        </span>
      )}

      {/* FMLY number — below avatar */}
      {serial && (
        <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 text-[7px] font-mono leading-none text-white/60 whitespace-nowrap pointer-events-none">
          {serial}
        </span>
      )}
    </button>
  );
}

export function PlayerHeader({
  avatarUrl,
  artistName,
  songTitle,
  spotifyTrackId,
  showMenuButton = false,
  isVerified,
  userId,
  onProfileClick,
}: PlayerHeaderProps) {
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
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", minWidth: 0, gap: 8 }}>
        {showMenuButton && (
          <SidebarTrigger
            className="p-1 rounded-md text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors md:hidden"
            style={{ flexShrink: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="4" x2="14" y2="4" />
              <line x1="2" y1="8" x2="14" y2="8" />
              <line x1="2" y1="12" x2="14" y2="12" />
            </svg>
          </SidebarTrigger>
        )}

        <AvatarWithBadges
          avatarUrl={avatarUrl}
          isVerified={isVerified}
          userId={userId}
          onProfileClick={onProfileClick}
        />

        <div className="flex items-center gap-1 min-w-0 overflow-hidden">
          {artistName && (
            <span className="text-[10px] font-mono font-medium uppercase tracking-[0.14em] text-white/70 shrink-0 truncate">
              {artistName}
            </span>
          )}
          {artistName && songTitle && <span className="text-[10px] font-mono text-white/35 shrink-0">·</span>}
          <span className="text-[10px] font-mono font-medium uppercase tracking-[0.14em] text-white/70 truncate">
            {songTitle}
          </span>
        </div>
      </div>

      {spotifyTrackId && (
        <a
          href={`https://open.spotify.com/track/${spotifyTrackId}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ flexShrink: 0, color: "rgba(255,255,255,0.5)" }}
          aria-label="Open in Spotify"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.5 17.34a.75.75 0 0 1-1.03.24c-2.81-1.72-6.34-2.11-10.5-1.15a.75.75 0 1 1-.34-1.46c4.54-1.04 8.43-.61 11.63 1.35a.75.75 0 0 1 .24 1.02zm1.47-3.26a.94.94 0 0 1-1.29.31c-3.22-1.98-8.12-2.55-11.93-1.37a.94.94 0 0 1-.56-1.8c4.17-1.3 9.53-.66 13.48 1.74.44.27.58.84.3 1.12zm.13-3.4C15.56 8.6 9.73 8.42 6.36 9.43a1.13 1.13 0 0 1-.66-2.16c3.87-1.18 10.31-.95 14.55 1.59a1.13 1.13 0 1 1-1.16 1.82z" />
          </svg>
        </a>
      )}
    </div>
  );
}
