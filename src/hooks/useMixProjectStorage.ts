import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const LOCAL_KEY = "mix_projects";

export interface MixProjectData {
  id: string;
  title: string;
  notes: string;
  mixes: { name: string; rank: number | null; comments: string }[];
  markerStart: number;
  markerEnd: number;
  createdAt: string;
  updatedAt: string;
}

function getLocal(): MixProjectData[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

function setLocal(projects: MixProjectData[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(projects));
}

export function useMixProjectStorage() {
  const { user } = useAuth();

  const list = useCallback(async (): Promise<MixProjectData[]> => {
    if (user) {
      const { data } = await supabase
        .from("mix_projects")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (data && data.length > 0) {
        return data.map((d: any) => ({
          id: d.id,
          title: d.title,
          notes: d.notes || "",
          mixes: (d.mixes as any[]) || [],
          markerStart: (d.mixes as any)?.[0]?.markerStart ?? 0,
          markerEnd: (d.mixes as any)?.[0]?.markerEnd ?? 0,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        }));
      }
    }
    return getLocal();
  }, [user]);

  const save = useCallback(
    async (project: MixProjectData) => {
      // Always save locally
      const local = getLocal();
      const idx = local.findIndex((p) => p.id === project.id);
      const updated = { ...project, updatedAt: new Date().toISOString() };
      if (idx >= 0) local[idx] = updated;
      else local.unshift(updated);
      setLocal(local);

      if (user) {
        const payload = {
          id: project.id,
          user_id: user.id,
          title: project.title,
          notes: project.notes || null,
          mixes: project.mixes.map((m) => ({
            ...m,
            markerStart: project.markerStart,
            markerEnd: project.markerEnd,
          })) as any,
        };
        await supabase.from("mix_projects").upsert(payload as any);
      }
    },
    [user]
  );

  const remove = useCallback(
    async (id: string) => {
      setLocal(getLocal().filter((p) => p.id !== id));
      if (user) {
        await supabase.from("mix_projects").delete().eq("id", id);
      }
    },
    [user]
  );

  return { list, save, remove };
}
