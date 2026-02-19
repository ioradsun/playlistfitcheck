import { useEffect, useState } from "react";
import { User, Music } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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

interface PostMeta {
  track_title: string;
  track_artists_json: { name: string }[];
  album_art_url: string | null;
  caption: string | null;
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

const RATING_BG: Record<string, string> = {
  missed: "bg-destructive/10",
  almost: "bg-yellow-500/10",
  solid: "bg-primary/10",
  hit: "bg-primary/15",
};

interface Props {
  postId: string | null;
  onClose: () => void;
}

export function HookReviewsSheet({ postId, onClose }: Props) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [post, setPost] = useState<PostMeta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    setRows([]);
    setPost(null);

    (async () => {
      // Fetch post meta + reviews in parallel
      const [postRes, reviewsRes] = await Promise.all([
        supabase
          .from("songfit_posts")
          .select("track_title, track_artists_json, album_art_url, caption")
          .eq("id", postId)
          .single(),
        supabase
          .from("songfit_hook_reviews")
          .select("id, hook_rating, would_replay, context_note, created_at, user_id, session_id")
          .eq("post_id", postId)
          .order("created_at", { ascending: false }),
      ]);

      if (postRes.data) {
        const raw = postRes.data;
        const artists = Array.isArray(raw.track_artists_json)
          ? (raw.track_artists_json as { name: string }[])
          : [];
        setPost({
          track_title: raw.track_title,
          track_artists_json: artists,
          album_art_url: raw.album_art_url,
          caption: raw.caption,
        });
      }

      const reviews = reviewsRes.data ?? [];
      if (reviews.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      // Fetch profiles for non-null user_ids
      const userIds = [...new Set(reviews.filter(r => r.user_id).map(r => r.user_id!))];
      let profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", userIds);
        for (const p of profiles || []) {
          profileMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
        }
      }

      setRows(reviews.map(r => ({
        ...r,
        profiles: r.user_id ? (profileMap[r.user_id] ?? null) : null,
      })) as ReviewRow[]);
      setLoading(false);
    })();
  }, [postId]);

  const artistNames = post?.track_artists_json.map(a => a.name).join(", ") ?? "";

  return (
    <Sheet open={!!postId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">

        {/* ── Song identity header ── */}
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-border/40 space-y-4">
          {/* Track identity */}
          <div className="flex items-center gap-3">
            {post?.album_art_url ? (
              <img
                src={post.album_art_url}
                alt={post.track_title}
                className="w-14 h-14 rounded-xl object-cover shrink-0 shadow-sm"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <Music size={20} className="text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-0.5">
                Hook Reviews
              </p>
              <h2 className="text-base font-bold leading-tight truncate">
                {post?.track_title ?? "Loading…"}
              </h2>
              {artistNames && (
                <p className="text-sm text-muted-foreground truncate mt-0.5">{artistNames}</p>
              )}
            </div>
          </div>

          {/* Hook lyrics block */}
          {post?.caption && (
            <div className="rounded-xl bg-muted/40 border border-border/50 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1.5">
                Hook
              </p>
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                {post.caption}
              </p>
            </div>
          )}

          {/* Review count */}
          {!loading && rows.length > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{rows.length}</span>{" "}
              {rows.length === 1 ? "review" : "reviews"}
            </p>
          )}
        </div>

        {/* ── Reviews list ── */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">No reviews yet.</p>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const name = row.profiles?.display_name || (row.user_id ? "User" : "Anonymous");
                const avatar = row.profiles?.avatar_url;
                return (
                  <div key={row.id} className="flex items-start gap-3 rounded-xl bg-muted/20 px-3 py-3">
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
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold">{name}</span>
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${RATING_COLOR[row.hook_rating] ?? "text-muted-foreground"} ${RATING_BG[row.hook_rating] ?? "bg-muted/40"}`}>
                          {RATING_LABEL[row.hook_rating] ?? row.hook_rating}
                        </span>
                        <span className={`text-[11px] font-medium ${row.would_replay ? "text-primary" : "text-muted-foreground/60"}`}>
                          {row.would_replay ? "↩ Replay" : "Skip"}
                        </span>
                      </div>
                      {row.context_note && (
                        <p className="text-xs text-foreground/80 leading-snug mb-1">{row.context_note}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/40">
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
