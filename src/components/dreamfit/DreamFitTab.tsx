import { useState, useCallback, useEffect } from "react";
import { Loader2, User, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { DreamToolCard } from "./DreamToolCard";
import { DreamComments } from "./DreamComments";
import { DreamInlineComposer } from "./DreamInlineComposer";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Dream } from "./types";

type DreamView = "recent" | "resolved" | "bypassed";

export function DreamFitTab() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentDreamId, setCommentDreamId] = useState<string | null>(null);
  const [view, setView] = useState<DreamView>("recent");

  const fetchDreams = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("dream_tools")
      .select("*, profiles:user_id(display_name, avatar_url, is_verified)")
      .order("trending_score", { ascending: false })
      .limit(50);
    setDreams((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDreams();
  }, [fetchDreams]);

  const handleRefresh = () => {
    setTimeout(() => {
      fetchDreams();
    }, 300);
  };

  const isRecentActive = view === "recent";
  const isResolvedActive = view === "resolved" || view === "bypassed";

  const filtered = view === "resolved"
    ? dreams.filter(d => d.greenlight_count > 0)
    : view === "bypassed"
    ? dreams.filter(d => d.greenlight_count === 0 && d.backers_count > 0)
    : dreams;

  return (
    <div className="w-full max-w-[470px] mx-auto">
      {/* Composer */}
      {user ? (
        <DreamInlineComposer onCreated={() => { fetchDreams(); }} />
      ) : (
        <div
          className="border-b border-border/40 cursor-pointer"
          onClick={() => navigate("/auth?mode=signup")}
        >
          <div className="flex gap-3 px-4 pt-3 pb-3">
            <div className="h-10 w-10 rounded-full bg-muted border border-border shrink-0 mt-1 flex items-center justify-center">
              <User size={16} className="text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0 flex items-center">
              <span className="text-base text-muted-foreground/60">Share your idea for the next Fit</span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border/40">
        <div className="flex">
          {/* Recent tab */}
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={() => setView("recent")}
              className={cn(
                "py-2.5 text-sm transition-all duration-150",
                isRecentActive
                  ? "font-medium text-foreground"
                  : "font-normal text-muted-foreground"
              )}
            >
              Recent
            </button>
          </div>

          {/* Resolved tab with dropdown */}
          <div className="flex-1 flex items-center justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => {
                    if (!isResolvedActive) {
                      e.preventDefault();
                      setView("resolved");
                    }
                  }}
                  className={cn(
                    "flex items-center gap-0.5 py-2.5 text-sm transition-all duration-150",
                    isResolvedActive
                      ? "font-medium text-foreground"
                      : "font-normal text-muted-foreground"
                  )}
                >
                  {view === "bypassed" ? "Bypassed" : "Resolved"}
                  <ChevronDown
                    size={12}
                    className={cn(
                      "transition-all duration-150",
                      isResolvedActive ? "opacity-60" : "opacity-0 w-0"
                    )}
                  />
                </button>
              </DropdownMenuTrigger>
              {isResolvedActive && (
                <DropdownMenuContent align="center" className="w-40 bg-popover z-50">
                  <DropdownMenuItem
                    onClick={() => setView("resolved")}
                    className={cn("text-sm", view === "resolved" && "text-foreground font-medium")}
                  >
                    Resolved
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setView("bypassed")}
                    className={cn("text-sm", view === "bypassed" && "text-foreground font-medium")}
                  >
                    Bypassed
                  </DropdownMenuItem>
                </DropdownMenuContent>
              )}
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-muted-foreground text-sm">
            {view === "resolved" ? "No resolved dreams yet." : view === "bypassed" ? "No bypassed dreams yet." : "No dreams yet. Be the first to ask for something."}
          </p>
        </div>
      ) : (
        <div className="pb-24">
          {filtered.map((dream) => (
            <DreamToolCard
              key={dream.id}
              dream={dream}
              onOpenComments={setCommentDreamId}
              onRefresh={handleRefresh}
            />
          ))}
        </div>
      )}

      {/* Comments Sheet */}
      <DreamComments
        dreamId={commentDreamId}
        dream={dreams.find(d => d.id === commentDreamId) ?? null}
        onClose={() => setCommentDreamId(null)}
        onCommentAdded={async (id) => {
          const { data } = await supabase.from("dream_tools").select("comments_count").eq("id", id).maybeSingle();
          if (data) setDreams(prev => prev.map(d => d.id === id ? { ...d, comments_count: data.comments_count } : d));
        }}
      />
    </div>
  );
}
