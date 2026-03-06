/**
 * useProjectScreen
 *
 * Single source of truth for "what screen are we on?".
 *
 * Every page transition resolves to one descriptor before rendering:
 *   { tool, mode, status, projectId }
 *
 * Rules
 * ──────
 * • No projectId in URL  →  mode = "new",      status = "ready"
 * • Auth still loading   →  mode = "existing",  status = "loading"
 * • No authenticated user →  mode = "existing",  status = "missing"
 * • Fetch returned 404   →  mode = "existing",  status = "missing"
 * • Fetch in progress    →  mode = "existing",  status = "loading"
 * • Data committed       →  mode = "existing",  status = "ready"
 */

import { useMemo } from "react";

export type Tool =
  | "songfit"
  | "hookfit"
  | "lyric"
  | "mix"
  | "hitfit"
  | "profit"
  | "playlist"
  | "dreamfit"
  | "vibefit";

export type ScreenMode = "new" | "existing";
export type ScreenStatus = "loading" | "ready" | "missing" | "error";

export interface ProjectScreen {
  tool: Tool;
  mode: ScreenMode;
  status: ScreenStatus;
  projectId: string | undefined;
}

export const PATH_TO_TOOL: Record<string, Tool> = {
  "/CrowdFit":    "songfit",
  "/HookFit":     "hookfit",
  "/SongFit":     "songfit",   // legacy redirect support
  "/ProFit":      "profit",
  "/PlaylistFit": "playlist",
  "/MixFit":      "mix",
  "/LyricFit":    "lyric",
  "/HitFit":      "hitfit",
  "/DreamFit":    "dreamfit",
  "/VibeFit":     "vibefit",
};

interface UseProjectScreenOptions {
  pathname: string;
  projectId: string | undefined;
  authLoading: boolean;
  user: { id: string } | null | undefined;
  /**
   * True once the active tool's project data has been fetched and
   * committed to component state. Ignored when projectId is absent.
   */
  dataLoaded: boolean;
  /**
   * True if the most recent fetch returned no data (404 / not found).
   * Triggers status = "missing" so callers can show an error state.
   */
  dataMissing: boolean;
}

export function useProjectScreen({
  pathname,
  projectId,
  authLoading,
  user,
  dataLoaded,
  dataMissing,
}: UseProjectScreenOptions): ProjectScreen {
  return useMemo<ProjectScreen>(() => {
    const basePath = pathname.replace(/\/[0-9a-f-]{36}$/, "");
    const tool: Tool =
      PATH_TO_TOOL[basePath] ?? PATH_TO_TOOL[pathname] ?? "songfit";

    // ── New project (no projectId in URL) ────────────────────────────────
    if (!projectId) {
      return { tool, mode: "new", status: "ready", projectId: undefined };
    }

    // ── Existing project — cascade through guard conditions ───────────────
    if (authLoading) {
      return { tool, mode: "existing", status: "loading", projectId };
    }

    if (!user) {
      return { tool, mode: "existing", status: "missing", projectId };
    }

    if (dataMissing) {
      return { tool, mode: "existing", status: "missing", projectId };
    }

    if (!dataLoaded) {
      return { tool, mode: "existing", status: "loading", projectId };
    }

    return { tool, mode: "existing", status: "ready", projectId };
  }, [pathname, projectId, authLoading, user, dataLoaded, dataMissing]);
}
