import { useState, useCallback, useEffect } from "react";
import { Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { DreamToolCard } from "./DreamToolCard";
import { DreamComments } from "./DreamComments";
import { DreamInlineComposer } from "./DreamInlineComposer";
import type { Dream } from "./types";

export function DreamFitTab() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [backedIds, setBackedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [commentDreamId, setCommentDreamId] = useState<string | null>(null);

  const fetchDreams = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("dream_tools")
      .select("*, profiles:user_id(display_name, avatar_url)")
      .order("trending_score", { ascending: false })
      .limit(50);
    setDreams((data as any) || []);
    setLoading(false);
  }, []);

  const fetchBacked = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("dream_backers")
      .select("dream_id")
      .eq("user_id", user.id);
    setBackedIds(new Set((data || []).map((d: any) => d.dream_id)));
  }, [user]);

  useEffect(() => {
    fetchDreams();
    fetchBacked();
  }, [fetchDreams, fetchBacked]);

  const handleRefresh = () => {
    setTimeout(() => {
      fetchDreams();
      fetchBacked();
    }, 300);
  };

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
              <span className="text-base text-muted-foreground/60">Sign Up to post a dream</span>
            </div>
          </div>
        </div>
      )}

      {/* Feed */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : dreams.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-muted-foreground text-sm">No dreams yet. Be the first to ask for something.</p>
        </div>
      ) : (
        <div>
          {dreams.map((dream) => (
            <DreamToolCard
              key={dream.id}
              dream={dream}
              isBacked={backedIds.has(dream.id)}
              onToggleBack={handleRefresh}
              onOpenComments={setCommentDreamId}
              onRefresh={handleRefresh}
            />
          ))}
        </div>
      )}

      {/* Comments Sheet */}
      <DreamComments
        dreamId={commentDreamId}
        onClose={() => setCommentDreamId(null)}
        onCommentAdded={async (id) => {
          const { data } = await supabase.from("dream_tools").select("comments_count").eq("id", id).maybeSingle();
          if (data) setDreams(prev => prev.map(d => d.id === id ? { ...d, comments_count: data.comments_count } : d));
        }}
      />
    </div>
  );
}
