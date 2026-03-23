import { supabase } from "@/integrations/supabase/client";

const LIGHTNING_BAR_KEY = "__LYRIC_DANCE_LIGHTNING_BAR";
const SITE_COPY_CACHE_KEY = "tfm:site_copy";
const LIGHTNING_BAR_FEATURE_KEY = "lyric_dance_lightning_bar";
export const LIGHTNING_BAR_FLAG_EVENT = "lyric-dance-lightning-bar-updated";

const parseStoredFlag = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().trim();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false" || normalized === "") return false;
  return null;
};

export const readLightningBarFlagFromCopy = (copyJson: any): boolean | null =>
  parseStoredFlag(copyJson?.features?.[LIGHTNING_BAR_FEATURE_KEY]);

const readLightningBarFlagFromCachedSiteCopy = (): boolean | null => {
  try {
    const raw = localStorage.getItem(SITE_COPY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data?: Record<string, any> };
    return readLightningBarFlagFromCopy(parsed?.data);
  } catch {
    return null;
  }
};

export const applyLightningBarFlag = (enabled: boolean): void => {
  if (typeof window === "undefined") return;

  (window as any).__LYRIC_DANCE_LIGHTNING_BAR = enabled;

  try {
    if (enabled) {
      sessionStorage.setItem(LIGHTNING_BAR_KEY, "1");
      localStorage.setItem(LIGHTNING_BAR_KEY, "1");
    } else {
      sessionStorage.removeItem(LIGHTNING_BAR_KEY);
      localStorage.removeItem(LIGHTNING_BAR_KEY);
    }
  } catch {
    // no-op
  }

  window.dispatchEvent(new CustomEvent(LIGHTNING_BAR_FLAG_EVENT, { detail: enabled }));
};

export const readLightningBarFlag = (): boolean => {
  if (typeof window === "undefined") return false;

  const existingWindowFlag = parseStoredFlag((window as any).__LYRIC_DANCE_LIGHTNING_BAR);
  if (existingWindowFlag !== null) return existingWindowFlag;

  const cachedCopyFlag = readLightningBarFlagFromCachedSiteCopy();
  if (cachedCopyFlag !== null) return cachedCopyFlag;

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
  applyLightningBarFlag(enabled);
  return enabled;
};

export const refreshLightningBarFlagFromBackend = async (): Promise<boolean> => {
  try {
    const { data } = await supabase
      .from("site_copy")
      .select("copy_json")
      .limit(1)
      .maybeSingle();

    const enabled = readLightningBarFlagFromCopy(data?.copy_json) ?? false;
    applyLightningBarFlag(enabled);
    return enabled;
  } catch {
    const fallback = readLightningBarFlag();
    applyLightningBarFlag(fallback);
    return fallback;
  }
};
