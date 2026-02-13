import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, Music, Plus, BarChart3, MoreVertical, Trash2, Sliders } from "lucide-react";
import { toast } from "sonner";
import { useMixProjectStorage, type MixProjectData } from "@/hooks/useMixProjectStorage";

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
  report_data: any;
}

const getLabelColor = (label: string | null) => {
  if (!label) return "text-muted-foreground";
  const l = label.toLowerCase();
  if (l.includes("strong") || l.includes("great") || l.includes("good")) return "text-green-500";
  if (l.includes("moderate") || l.includes("fair") || l.includes("decent")) return "text-yellow-500";
  return "text-red-500";
};

const EmptyState = ({ icon: Icon, message, actionLabel, onAction }: {
  icon: React.ElementType;
  message: string;
  actionLabel: string;
  onAction: () => void;
}) => (
  <Card className="glass-card border-border">
    <CardContent className="py-12 text-center space-y-4">
      <Icon size={40} className="mx-auto text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button onClick={onAction} className="gap-2">
        <Plus size={16} /> {actionLabel}
      </Button>
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const { user, loading: authLoading, profile } = useAuth();
  const navigate = useNavigate();
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loadingSearches, setLoadingSearches] = useState(true);
  const [mixProjects, setMixProjects] = useState<MixProjectData[]>([]);
  const [loadingMix, setLoadingMix] = useState(true);
  const { list: listMixProjects, remove: removeMixProject } = useMixProjectStorage();

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // Load playlist fit checks
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

  // Load mix projects
  useEffect(() => {
    if (!user) return;
    setLoadingMix(true);
    listMixProjects().then((p) => {
      setMixProjects(p);
      setLoadingMix(false);
    });
  }, [user, listMixProjects]);

  const handleDeleteSearch = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const { error } = await supabase.from("saved_searches").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
    } else {
      setSearches(prev => prev.filter(s => s.id !== id));
      toast.success("Fit check deleted");
    }
  };

  const handleDeleteMixProject = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await removeMixProject(id);
    setMixProjects(prev => prev.filter(p => p.id !== id));
    toast.success("Mix project deleted");
  }, [removeMixProject]);

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen bg-background pt-20 px-4 pb-12">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, {profile?.display_name ?? user.email?.split("@")[0]}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/profile")}>
              <User size={14} /> Profile
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => navigate("/")}>
              <Plus size={14} /> New Check
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="playlist">
          <TabsList className="w-full">
            <TabsTrigger value="playlist" className="flex-1 gap-1.5">
              <Music size={14} /> Playlist Fit Check
            </TabsTrigger>
            <TabsTrigger value="mix" className="flex-1 gap-1.5">
              <Sliders size={14} /> Mix Fit Check
            </TabsTrigger>
          </TabsList>

          {/* Playlist Fit Check Tab */}
          <TabsContent value="playlist" className="mt-4">
            {loadingSearches ? (
              <div className="text-sm text-muted-foreground py-12 text-center">Loading your fit checks…</div>
            ) : searches.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                message="No playlist fit checks yet. Run your first one to see results here."
                actionLabel="Run a Fit Check"
                onAction={() => navigate("/")}
              />
            ) : (
              <div className="space-y-3">
                {searches.map((s) => {
                  const displayScore = s.blended_score ?? s.health_score;
                  const displayLabel = s.blended_score != null
                    ? (s.blended_label ?? "Fit")
                    : (s.health_label ?? "Health");

                  return (
                    <Card
                      key={s.id}
                      className="glass-card border-border hover:border-primary/30 transition-colors cursor-pointer"
                      onClick={() => {
                        if (s.report_data) {
                          navigate("/", { state: { reportData: s.report_data } });
                        } else {
                          navigate("/", { state: { autoRun: { playlistUrl: s.playlist_url, songUrl: s.song_url } } });
                        }
                      }}
                    >
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
                                year: "numeric", month: "short", day: "numeric",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </p>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <p className="text-lg font-mono font-bold text-primary">{displayScore ?? "—"}</p>
                              <p className={`text-[10px] font-medium ${getLabelColor(displayLabel)}`}>
                                {displayLabel}
                              </p>
                            </div>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <button className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
                                  <MoreVertical size={16} />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40 bg-card border-border z-[100]">
                                <DropdownMenuItem
                                  onClick={(e) => handleDeleteSearch(e, s.id)}
                                  className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                                >
                                  <Trash2 size={14} /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Mix Fit Check Tab */}
          <TabsContent value="mix" className="mt-4">
            {loadingMix ? (
              <div className="text-sm text-muted-foreground py-12 text-center">Loading your mix projects…</div>
            ) : mixProjects.length === 0 ? (
              <EmptyState
                icon={Sliders}
                message="No mix projects yet. Create one to compare your mixes."
                actionLabel="New Mix Project"
                onAction={() => navigate("/")}
              />
            ) : (
              <div className="space-y-3">
                {mixProjects.map((p) => (
                  <Card
                    key={p.id}
                    className="glass-card border-border hover:border-primary/30 transition-colors cursor-pointer"
                    onClick={() => {
                      // Navigate to Mix Fit Check tab with this project loaded
                      navigate("/", { state: { loadMixProject: p } });
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <Sliders size={14} className="text-primary shrink-0" />
                            <p className="text-sm font-medium truncate">{p.title}</p>
                          </div>
                          <p className="text-xs text-muted-foreground pl-[22px]">
                            {p.mixes.length} mix{p.mixes.length !== 1 ? "es" : ""}
                            {p.notes ? ` · ${p.notes}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground pl-[22px]">
                            {new Date(p.updatedAt).toLocaleDateString(undefined, {
                              year: "numeric", month: "short", day: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {/* Show top-ranked mix if any */}
                          {p.mixes.some(m => m.rank === 1) && (
                            <div className="text-right">
                              <p className="text-xs text-primary font-medium">★ Top Pick</p>
                              <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                                {p.mixes.find(m => m.rank === 1)?.name}
                              </p>
                            </div>
                          )}

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <button className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
                                <MoreVertical size={16} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40 bg-card border-border z-[100]">
                              <DropdownMenuItem
                                onClick={(e) => handleDeleteMixProject(e, p.id)}
                                className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                              >
                                <Trash2 size={14} /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;
