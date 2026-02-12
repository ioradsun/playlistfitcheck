import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, Music, ExternalLink, Plus, BarChart3 } from "lucide-react";

interface SavedSearch {
  id: string;
  playlist_name: string | null;
  playlist_url: string | null;
  song_name: string | null;
  song_url: string | null;
  health_score: number | null;
  health_label: string | null;
  blended_score: number | null;
  blended_label: string | null;
  created_at: string;
}

const Dashboard = () => {
  const { user, loading: authLoading, profile } = useAuth();
  const navigate = useNavigate();
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loadingSearches, setLoadingSearches] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("saved_searches")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setSearches(data as SavedSearch[]);
        setLoadingSearches(false);
      });
  }, [user]);

  if (authLoading || !user) return null;

  const getLabelColor = (label: string | null) => {
    if (!label) return "text-muted-foreground";
    const l = label.toLowerCase();
    if (l.includes("strong") || l.includes("great") || l.includes("good")) return "text-green-500";
    if (l.includes("moderate") || l.includes("fair") || l.includes("decent")) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div className="min-h-screen bg-background pt-20 px-4 pb-12">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Fit Check Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, {profile?.display_name ?? user.email?.split("@")[0]}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/profile")}>
              <User size={14} /> Profile
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => navigate("/")}>
              <Plus size={14} /> New Fit Check
            </Button>
          </div>
        </div>

        {/* Fit checks list */}
        {loadingSearches ? (
          <div className="text-sm text-muted-foreground py-12 text-center">Loading your fit checks…</div>
        ) : searches.length === 0 ? (
          <Card className="glass-card border-border">
            <CardContent className="py-12 text-center space-y-4">
              <BarChart3 size={40} className="mx-auto text-muted-foreground/50" />
              <div>
                <p className="text-sm text-muted-foreground">No fit checks yet.</p>
                <p className="text-sm text-muted-foreground">Run your first one to see results here.</p>
              </div>
              <Button onClick={() => navigate("/")} className="gap-2">
                <Plus size={16} /> Run a Fit Check
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {searches.map((s) => (
              <Card key={s.id} className="glass-card border-border hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Music size={14} className="text-primary shrink-0" />
                        <p className="text-sm font-medium truncate">{s.playlist_name || "Untitled Playlist"}</p>
                      </div>
                      {s.song_name && (
                        <p className="text-xs text-muted-foreground truncate pl-[22px]">
                          🎵 {s.song_name}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground pl-[22px]">
                        {new Date(s.created_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      {/* Health score */}
                      <div className="text-right">
                        <p className="text-lg font-mono font-bold text-primary">{s.health_score ?? "—"}</p>
                        <p className={`text-[10px] font-medium ${getLabelColor(s.health_label)}`}>
                          {s.health_label ?? "N/A"}
                        </p>
                      </div>

                      {/* Blended/fit score */}
                      {s.blended_score != null && (
                        <div className="text-right border-l border-border pl-4">
                          <p className="text-lg font-mono font-bold text-accent-foreground">{s.blended_score}</p>
                          <p className={`text-[10px] font-medium ${getLabelColor(s.blended_label)}`}>
                            {s.blended_label ?? "Fit"}
                          </p>
                        </div>
                      )}

                      {/* External link */}
                      {s.playlist_url && (
                        <a
                          href={s.playlist_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
