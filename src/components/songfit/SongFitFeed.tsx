import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { SongFitPost } from "./types";
import { SongFitPostCard } from "./SongFitPostCard";
import { SongFitCreatePost } from "./SongFitCreatePost";
import { SongFitComments } from "./SongFitComments";

type FeedTab = "new" | "trending";

export function SongFitFeed() {
  const { user } = useAuth();
  const [feedTab, setFeedTab] = useState<FeedTab>("new");
  const [posts, setPosts] = useState<SongFitPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("songfit_posts")
      .select("*, profiles:user_id(display_name, avatar_url, spotify_artist_id)")
      .limit(50);

    if (search.trim()) {
      query = query.or(`track_title.ilike.%${search.trim()}%,caption.ilike.%${search.trim()}%`);
    }

    if (feedTab === "trending") {
      query = query.order("likes_count", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    const { data } = await query;
    let enriched = (data || []) as unknown as SongFitPost[];

    // Enrich with user like/save status
    if (user && enriched.length > 0) {
      const postIds = enriched.map(p => p.id);
      const [likesRes, savesRes] = await Promise.all([
        supabase.from("songfit_likes").select("post_id").eq("user_id", user.id).in("post_id", postIds),
        supabase.from("songfit_saves").select("post_id").eq("user_id", user.id).in("post_id", postIds),
      ]);
      const likedSet = new Set((likesRes.data || []).map(l => l.post_id));
      const savedSet = new Set((savesRes.data || []).map(s => s.post_id));
      enriched = enriched.map(p => ({
        ...p,
        user_has_liked: likedSet.has(p.id),
        user_has_saved: savedSet.has(p.id),
      }));
    }

    setPosts(enriched);
    setLoading(false);
  }, [feedTab, search, user]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  if (commentPostId) {
    return <SongFitComments postId={commentPostId} onBack={() => { setCommentPostId(null); fetchPosts(); }} />;
  }

  if (showCreate) {
    return <SongFitCreatePost onPostCreated={() => { setShowCreate(false); fetchPosts(); }} onCancel={() => setShowCreate(false)} />;
  }

  return (
    <div className="w-full max-w-[470px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-2 pb-3">
        <h1 className="text-xl font-black tracking-tight">SongFit</h1>
        {user && (
          <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Post
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground px-3 pb-3">
        Scroll songs like Instagram. Tap to open in Spotify.
      </p>

      {/* Search */}
      <div className="relative px-3 pb-3">
        <Search size={14} className="absolute left-6 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search tracks or captions..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Feed tabs */}
      <div className="px-3 pb-3">
        <Tabs value={feedTab} onValueChange={v => setFeedTab(v as FeedTab)}>
          <TabsList className="w-full h-9">
            <TabsTrigger value="new" className="flex-1 text-xs">New</TabsTrigger>
            <TabsTrigger value="trending" className="flex-1 text-xs">Trending</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Posts — IG-style, no gaps between cards, separated by border */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-muted-foreground text-sm">No posts yet.</p>
          {user && (
            <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
              Be the first to post
            </Button>
          )}
        </div>
      ) : (
        <div>
          {posts.map(post => (
            <SongFitPostCard
              key={post.id}
              post={post}
              onOpenComments={setCommentPostId}
              onRefresh={fetchPosts}
            />
          ))}
        </div>
      )}
    </div>
  );
}
