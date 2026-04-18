import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function getIsMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * iOS platform detection via user agent.
 * Covers:
 *   - iPhone, iPod (classic UA)
 *   - iPad with iPadOS 13+ that spoofs as MacIntel (navigator.platform + maxTouchPoints)
 */
function getIsIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPod/.test(ua)) return true;
  if (/iPad/.test(ua)) return true;
  // iPadOS 13+ reports as desktop Safari — use touch points to disambiguate
  if (
    navigator.platform === "MacIntel" &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }
  return false;
}

function getIsAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}

/**
 * Returns true when the device should get mobile/touch-first UX (reels mode, etc.).
 *
 * Detection order (OR semantics):
 *   1. Viewport width < 768px (covers narrow desktop windows + phones + iPad split-view)
 *   2. iOS user-agent (covers iPad full-width and any iOS where viewport reporting flakes)
 *   3. Android user-agent (symmetric with iOS coverage)
 *
 * Initial state syncs with actual viewport via `mql.matches` INSIDE the effect,
 * not just the initial render. This fixes iOS Safari's known behavior where
 * `window.innerWidth` briefly reports a wider value during page load before the
 * viewport meta tag settles.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    // Initial render: best-effort, may be wrong during iOS viewport settlement
    return getIsMobile() || getIsIOS() || getIsAndroid();
  });

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    const sync = () => {
      // Use mql.matches (source of truth for viewport state at effect run time)
      // combined with UA detection as a defensive OR.
      const result = mql.matches || getIsIOS() || getIsAndroid();
      setIsMobile(result);
    };

    // Critical: sync state immediately on mount. Fixes iOS Safari's initial
    // viewport width misreporting during page load.
    sync();

    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  return isMobile;
}

/**
 * iOS-only detector. Use when behavior should depend specifically on iOS
 * (e.g., gesture-based audio unlock, safe-area insets), not just touch/narrow.
 */
export function useIsIOS(): boolean {
  const [isIOS, setIsIOS] = React.useState<boolean>(getIsIOS);
  React.useEffect(() => {
    // UA doesn't change, but sync once post-mount defensively
    setIsIOS(getIsIOS());
  }, []);
  return isIOS;
}
