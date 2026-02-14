import { useState, useEffect } from "react";
import { User, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface LikeUser {
  user_id: string;
  created_at: string;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
}

interface Props {
  postId: string | null;
  onClose: () => void;
}

export function SongFitLikesList({ postId, onClose }: Props) {
  const [users, setUsers] = useState<LikeUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!postId) return;
    setUsers([]);
    setLoading(true);
    supabase
      .from("songfit_likes")
      .select("user_id, created_at, profiles!songfit_likes_user_id_profiles_fkey(display_name, avatar_url)")
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setUsers((data || []) as unknown as LikeUser[]);
        setLoading(false);
      });
  }, [postId]);

  return (
    <Sheet open={!!postId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border/40 shrink-0">
          <SheetTitle className="text-base">Likes</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No likes yet</p>
          ) : (
            users.map(u => (
              <div key={u.user_id} className="flex items-center gap-3 py-2.5">
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {u.profiles?.avatar_url ? (
                    <img src={u.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User size={14} className="text-muted-foreground" />
                  )}
                </div>
                <p className="text-sm font-medium truncate">{u.profiles?.display_name || "Anonymous"}</p>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
