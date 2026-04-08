import { supabase } from "@/integrations/supabase/client";

const inFlightPrefetches = new Map<string, Promise<unknown>>();

export const MixFitCheckImport = () => import("@/pages/MixFitCheck");
export const LyricFitTabImport = () => import("@/components/lyric/LyricFitTab");
export const HitFitTabImport = () => import("@/components/hitfit/HitFitTab");
export const ProFitTabImport = () => import("@/components/profit/ProFitTab");
export const SongFitTabImport = () => import("@/components/songfit/SongFitTab");
export const DreamFitTabImport = () => import("@/components/dreamfit/DreamFitTab");
export const VibeFitTabImport = () => import("@/components/vibefit/VibeFitTab");
export const AppSidebarImport = () => import("@/components/AppSidebar");

export const AdminPageImport = () => import("@/pages/Admin");
export const ShareableLyricDanceImport = () => import("@/pages/ShareableLyricDance");

const ROUTE_CHUNK_PREFETCH: Record<string, () => Promise<unknown>> = {
  "/CrowdFit": SongFitTabImport,
  "/SongFit": SongFitTabImport,
  "/HitFit": HitFitTabImport,
  "/VibeFit": VibeFitTabImport,
  "/ProFit": ProFitTabImport,
  "/PlaylistFit": AppSidebarImport,
  "/MixFit": MixFitCheckImport,
  "/LyricFit": LyricFitTabImport,
  "/DreamFit": DreamFitTabImport,
  "/admin": AdminPageImport,
};

const projectTableByType: Record<string, string> = {
  profit: "profit_reports",
  playlist: "saved_searches",
  mix: "mix_projects",
  lyric: "lyric_projects",
  hitfit: "saved_hitfit",
  vibefit: "saved_vibefit",
};

export const prefetchRouteChunk = (path: string) => {
  const basePath = path.replace(/\/[0-9a-f-]{36}$/, "");
  const importer = ROUTE_CHUNK_PREFETCH[basePath] ?? ROUTE_CHUNK_PREFETCH[path];
  if (!importer) return;
  void importer().catch((error) => {
    if (
      typeof window !== "undefined" &&
      error instanceof Error &&
      error.message.includes("Failed to fetch dynamically imported module")
    ) {
      window.location.reload();
    }
  });
};

export const prefetchRouteData = (path: string, options?: { userId?: string; itemType?: string; itemId?: string }) => {
  const key = JSON.stringify({ path, userId: options?.userId, itemType: options?.itemType, itemId: options?.itemId });
  if (inFlightPrefetches.has(key)) return inFlightPrefetches.get(key);

  const task = (async () => {
    if (options?.itemType && options?.itemId) {
      const table = projectTableByType[options.itemType];
      if (table) {
        await supabase.from(table as never).select("id").eq("id", options.itemId).maybeSingle();
      }
      return;
    }

    const basePath = path.replace(/\/[0-9a-f-]{36}$/, "");
    if (basePath === "/PlaylistFit" && options?.userId) {
      await supabase.from("saved_searches").select("id").eq("user_id", options.userId).order("created_at", { ascending: false }).limit(1);
    }
    if (basePath === "/LyricFit" && options?.userId) {
      await supabase.from("lyric_projects").select("id").eq("user_id", options.userId).order("updated_at", { ascending: false }).limit(1);
    }
    if (basePath === "/MixFit" && options?.userId) {
      await supabase.from("mix_projects").select("id").eq("user_id", options.userId).order("updated_at", { ascending: false }).limit(1);
    }
  })().finally(() => {
    inFlightPrefetches.delete(key);
  });

  inFlightPrefetches.set(key, task);
  return task;
};

export const prefetchNavigationTarget = (path: string, options?: { userId?: string; itemType?: string; itemId?: string }) => {
  prefetchRouteChunk(path);
  void prefetchRouteData(path, options);
};
