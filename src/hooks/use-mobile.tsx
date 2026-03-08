import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

const getMobileSnapshot = () => {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_QUERY).matches;
};

export function useIsMobile() {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const mediaQuery = window.matchMedia(MOBILE_QUERY);
      mediaQuery.addEventListener("change", onStoreChange);
      return () => mediaQuery.removeEventListener("change", onStoreChange);
    },
    getMobileSnapshot,
    () => false,
  );
}
