const LIGHTNING_BAR_KEY = "__LYRIC_DANCE_LIGHTNING_BAR";

const parseStoredFlag = (value: string | null): boolean | null => {
  if (value === null) return null;
  return value === "1" || value.toLowerCase() === "true";
};

export const readLightningBarFlag = (): boolean => {
  if (typeof window === "undefined") return false;

  try {
    const sessionValue = parseStoredFlag(sessionStorage.getItem(LIGHTNING_BAR_KEY));
    if (sessionValue !== null) return sessionValue;

    const localValue = parseStoredFlag(localStorage.getItem(LIGHTNING_BAR_KEY));
    if (localValue !== null) return localValue;
  } catch {
    return false;
  }

  return false;
};

export const hydrateLightningBarFlag = (): boolean => {
  const enabled = readLightningBarFlag();
  if (typeof window !== "undefined") {
    (window as any).__LYRIC_DANCE_LIGHTNING_BAR = enabled;
  }
  return enabled;
};

export const persistLightningBarFlag = (enabled: boolean): void => {
  if (typeof window !== "undefined") {
    (window as any).__LYRIC_DANCE_LIGHTNING_BAR = enabled;
  }

  try {
    if (enabled) {
      sessionStorage.setItem(LIGHTNING_BAR_KEY, "1");
      localStorage.setItem(LIGHTNING_BAR_KEY, "1");
      return;
    }

    sessionStorage.removeItem(LIGHTNING_BAR_KEY);
    localStorage.removeItem(LIGHTNING_BAR_KEY);
  } catch {
    // no-op: storage may be unavailable in strict privacy contexts
  }
};
