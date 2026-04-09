import { useState, useRef, useEffect, type ReactNode, type RefObject } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useFmlyNumber } from "@/hooks/useFmlyNumber";
import { motion, AnimatePresence } from "framer-motion";
import { User, Mail, Waves, LayoutList, ExternalLink, Sparkles } from "lucide-react";
import { useDmContext } from "@/hooks/useDmContext";

export type CardMode = "listen" | "moments" | "empowerment" | "truth";

const MODE_ICONS: Record<CardMode, ReactNode> = {
  listen: <Waves size={14} />,
  moments: <LayoutList size={14} />,
  empowerment: <Sparkles size={14} />,
  truth: <Sparkles size={14} />,
};

const MODES: CardMode[] = ["listen", "moments", "truth"];

function useClickOutside(
  refs: RefObject<Element | null>[],
  onOutside: () => void,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (refs.some((r) => r.current?.contains(t))) return;
      onOutside();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

interface PlayerHeaderProps {
  avatarUrl?: string | null;
  artistName?: string;
  songTitle: string;
  spotifyArtistId?: string | null;
  lyricDanceUrl?: string | null;
  showMenuButton?: boolean;
  isVerified?: boolean;
  userId?: string | null;
  onProfileClick?: () => void;
  cardMode: CardMode;
  onModeChange: (mode: CardMode) => void;
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
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-black/80 border border-white/10 rounded-full px-1 text-[6px] font-mono leading-none text-white/70 whitespace-nowrap pointer-events-none">
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
  spotifyArtistId,
  lyricDanceUrl,
  showMenuButton = false,
  isVerified,
  userId,
  onProfileClick,
  cardMode,
  onModeChange
}: PlayerHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const { openCompose } = useDmContext();
  const pillRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const modeTriggerRef = useRef<HTMLButtonElement>(null);
  const modePillRef = useRef<HTMLDivElement>(null);

  useClickOutside([pillRef, avatarRef], () => setMenuOpen(false), menuOpen);
  useClickOutside([modePillRef, modeTriggerRef], () => setModeOpen(false), modeOpen);

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
                  if (userId) openCompose(userId);
                  setTimeout(() => setMenuOpen(false), 200);
                }}
                className="text-white/50 hover:text-white/80 transition-colors"
                style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "none", border: "none", cursor: "pointer" }}
                aria-label="Send message"
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
          position: "relative",
          display: "flex",
          alignItems: "center",
        }}
      >
        <AnimatePresence>
          {modeOpen && (
            <motion.div
              ref={modePillRef}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                right: 28,
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
            >
              {MODES.map((mode, i) => {
                const isActive = cardMode === mode;
                const icon = MODE_ICONS[mode];
                return (
                  <motion.button
                    key={mode}
                    type="button"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onModeChange(mode);
                    }}
                    style={{
                      position: "relative",
                      width: 28,
                      height: 28,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.25)",
                      transition: "color 150ms ease",
                      padding: 0,
                    }}
                    aria-label={mode}
                  >
                    {icon}
                    {isActive && (
                      <span
                        style={{
                          position: "absolute",
                          bottom: 3,
                          left: "50%",
                          transform: "translateX(-50%)",
                          width: 3,
                          height: 3,
                          borderRadius: "50%",
                          background: "rgba(255,255,255,0.9)",
                          pointerEvents: "none",
                        }}
                      />
                    )}
                  </motion.button>
                );
              })}
              {lyricDanceUrl && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 4 * 0.04 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(lyricDanceUrl, "_blank");
                  }}
                  className="hover:text-white/80 transition-colors"
                  style={{
                    position: "relative",
                    width: 28,
                    height: 28,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "rgba(255,255,255,0.25)",
                    transition: "color 150ms ease",
                    padding: 0,
                  }}
                  aria-label="Open in new tab"
                >
                  <ExternalLink size={14} />
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          ref={modeTriggerRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setModeOpen((prev) => !prev);
          }}
          style={{
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: modeOpen ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)",
            transition: "color 150ms ease",
            flexShrink: 0,
            padding: 0,
          }}
          aria-label="Switch card mode"
        >
          {MODE_ICONS[cardMode]}
        </button>
      </div>
    </div>
  );
}
