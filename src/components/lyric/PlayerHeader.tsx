import { useState, useRef, useEffect, type RefObject } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useFmlyNumber } from "@/hooks/useFmlyNumber";
import { motion, AnimatePresence } from "framer-motion";
import { User, Mail } from "lucide-react";
import { toast } from "sonner";

interface PlayerHeaderProps {
  avatarUrl?: string | null;
  artistName?: string;
  songTitle: string;
  spotifyTrackId?: string | null;
  spotifyArtistId?: string | null;
  showMenuButton?: boolean;
  isVerified?: boolean;
  userId?: string | null;
  onProfileClick?: () => void;
}

interface AvatarWithBadgesProps {
  avatarUrl?: string | null;
  isVerified?: boolean;
  userId?: string | null;
  menuOpen: boolean;
  onToggle: () => void;
  avatarRef: RefObject<HTMLButtonElement>;
}

function AvatarWithBadges({
  avatarUrl,
  isVerified,
  userId,
  menuOpen,
  onToggle,
  avatarRef,
}: AvatarWithBadgesProps) {
  const { number, isBlazer, loading } = useFmlyNumber(userId);
  const serial = isBlazer && !loading ? String(number).padStart(4, "0") : null;

  return (
    <button
      ref={avatarRef}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="relative shrink-0 cursor-pointer"
      aria-label={menuOpen ? "Close profile actions" : "Open profile actions"}
    >
      <div
        className={`h-7 w-7 rounded-full overflow-hidden bg-white/10 flex items-center justify-center transition-all duration-150 ${
          menuOpen ? "ring-2 ring-white/40 scale-95" : "ring-1 ring-white/[0.06]"
        }`}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <User size={12} className="text-white/40" />
        )}
      </div>

      {isVerified && (
        <span className="absolute -bottom-0.5 -right-0.5 pointer-events-none">
          <VerifiedBadge size={11} />
        </span>
      )}

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
  spotifyArtistId,
  showMenuButton = false,
  isVerified,
  userId,
  onProfileClick,
}: PlayerHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (pillRef.current?.contains(target) || avatarRef.current?.contains(target)) return;
      setMenuOpen(false);
    };

    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [menuOpen]);

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
      <div style={{ display: "flex", alignItems: "center", minWidth: 0, gap: 8, position: "relative" }}>
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
          menuOpen={menuOpen}
          onToggle={() => setMenuOpen((prev) => !prev)}
          avatarRef={avatarRef}
        />

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              ref={pillRef}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              style={{
                position: "absolute",
                left: showMenuButton ? 68 : 36,
                top: "50%",
                transform: "translateY(-50%)",
                height: 28,
                borderRadius: 14,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(12px)",
                display: "flex",
                alignItems: "center",
                gap: 2,
                padding: "0 4px",
                overflow: "hidden",
                zIndex: 20,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {spotifyArtistId && (
                <motion.a
                  href={`https://open.spotify.com/artist/${spotifyArtistId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.05 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTimeout(() => setMenuOpen(false), 200);
                  }}
                  className="text-white/50 hover:text-white/80 transition-colors"
                  style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  aria-label="Open artist on Spotify"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.5 17.34a.75.75 0 0 1-1.03.24c-2.81-1.72-6.34-2.11-10.5-1.15a.75.75 0 1 1-.34-1.46c4.54-1.04 8.43-.61 11.63 1.35a.75.75 0 0 1 .24 1.02zm1.47-3.26a.94.94 0 0 1-1.29.31c-3.22-1.98-8.12-2.55-11.93-1.37a.94.94 0 0 1-.56-1.8c4.17-1.3 9.53-.66 13.48 1.74.44.27.58.84.3 1.12zm.13-3.4C15.56 8.6 9.73 8.42 6.36 9.43a1.13 1.13 0 0 1-.66-2.16c3.87-1.18 10.31-.95 14.55 1.59a1.13 1.13 0 1 1-1.16 1.82z" />
                  </svg>
                </motion.a>
              )}

                <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: spotifyArtistId ? 0.1 : 0.05 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onProfileClick?.();
                  setTimeout(() => setMenuOpen(false), 200);
                }}
                className="text-white/50 hover:text-white/80 transition-colors"
                style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "none", border: "none", cursor: "pointer" }}
                aria-label="Open FMLY profile"
              >
                <User size={14} />
              </motion.button>

                <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: spotifyArtistId ? 0.15 : 0.1 }}
                onClick={(e) => {
                  e.stopPropagation();
                  toast("DMs coming soon");
                  setTimeout(() => setMenuOpen(false), 200);
                }}
                className="text-white/50 hover:text-white/80 transition-colors"
                style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "none", border: "none", cursor: "pointer" }}
                aria-label="DM coming soon"
              >
                <Mail size={14} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className="flex items-center gap-1 min-w-0 overflow-hidden"
          style={{
            opacity: menuOpen ? 0 : 1,
            transition: "opacity 150ms ease",
            pointerEvents: menuOpen ? "none" : "auto",
          }}
        >
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

      <div
        style={{
          opacity: menuOpen ? 0 : 1,
          transition: "opacity 150ms ease",
          pointerEvents: menuOpen ? "none" : "auto",
        }}
      >
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
    </div>
  );
}
