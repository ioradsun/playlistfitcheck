import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2 } from "lucide-react";

interface ReviewRow {
  id: string;
  hook_rating: string;
  would_replay: boolean;
  context_note: string | null;
  created_at: string;
  user_id: string | null;
  session_id: string | null;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
}

const RATING_LABEL: Record<string, string> = {
  missed: "Missed",
  almost: "Almost",
  solid: "Solid",
  hit: "Hit",
};

const RATING_COLOR: Record<string, string> = {
  missed: "text-destructive/80",
  almost: "text-yellow-500",
  solid: "text-primary/80",
  hit: "text-primary",
};

interface Props {
  postId: string | null;
  onClose: () => void;
}

export function HookReviewsSheet({ postId, onClose }: Props) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    setRows([]);

    supabase
      .from("songfit_hook_reviews")
      .select("id, hook_rating, would_replay, context_note, created_at, user_id, session_id, profiles(display_name, avatar_url)")
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setRows((data || []) as unknown as ReviewRow[]);
        setLoading(false);
      });
  }, [postId]);

  return (
    <Sheet open={!!postId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border/40 shrink-0">
          <SheetTitle className="text-base">Hook Reviews</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No reviews yet.</p>
          ) : (
            <div className="divide-y divide-border/30">
              {rows.map((row) => {
                const name = row.profiles?.display_name || (row.user_id ? "User" : "Anonymous");
                const avatar = row.profiles?.avatar_url;
                return (
                  <div key={row.id} className="flex items-start gap-3 py-3">
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden mt-0.5">
                      {avatar ? (
                        <img src={avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User size={14} className="text-muted-foreground" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{name}</span>
                        <span className={`text-xs font-medium ${RATING_COLOR[row.hook_rating] ?? "text-muted-foreground"}`}>
                          {RATING_LABEL[row.hook_rating] ?? row.hook_rating}
                        </span>
                        <span className="text-[10px] text-muted-foreground/50">·</span>
                        <span className="text-[11px] text-muted-foreground">
                          Replay: <span className={row.would_replay ? "text-primary" : "text-muted-foreground"}>{row.would_replay ? "Yes" : "No"}</span>
                        </span>
                      </div>
                      {row.context_note && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{row.context_note}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/40 mt-0.5">
                        {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
