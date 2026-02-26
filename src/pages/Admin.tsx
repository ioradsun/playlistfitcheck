import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Loader2, Users, Database, Trash2, MousePointerClick, FileText, Bot, CheckCircle2, Wrench, Music, Bomb } from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
const CopyEditor = lazy(() => import("@/components/admin/CopyEditor").then((m) => ({ default: m.CopyEditor })));
const AiPromptsEditor = lazy(() => import("@/components/admin/AiPromptsEditor").then((m) => ({ default: m.AiPromptsEditor })));
const PendingVerifications = lazy(() => import("@/components/admin/PendingVerifications").then((m) => ({ default: m.PendingVerifications })));
const ToolsEditor = lazy(() => import("@/components/admin/ToolsEditor").then((m) => ({ default: m.ToolsEditor })));
const FmlyArtists = lazy(() => import("@/components/admin/FmlyArtists").then((m) => ({ default: m.FmlyArtists })));
const GlobalCssEditor = lazy(() => import("@/components/admin/GlobalCssEditor").then((m) => ({ default: m.GlobalCssEditor })));

interface CheckFit { playlist_name: string | null; playlist_url: string | null; song_name: string | null; song_url: string | null; count: number; last_checked: string; }
interface DashboardData { totalEngagements: number; totalSearches: number; checkFits: CheckFit[]; }

interface AdminUser {
  id: string; email: string; display_name: string | null; avatar_url: string | null;
  role: string; fit_checks: number; created_at: string; last_sign_in_at: string | null; provider: string;
  engagement: { total: number }; is_unlimited: boolean;
}

const ADMIN_EMAILS = ["sunpatel@gmail.com", "spatel@iorad.com"];

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("users");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [nukeOpen, setNukeOpen] = useState(false);
  const [nuking, setNuking] = useState(false);
  const [nukeConfirmText, setNukeConfirmText] = useState("");
  const isAdmin = ADMIN_EMAILS.includes(user?.email ?? "");

  const fetchUsers = useCallback(async () => {
    const { data: result, error: fnError } = await supabase.functions.invoke("admin-dashboard", { body: { section: "users" } });
    if (fnError) throw fnError;
    if (result?.error) throw new Error(result.error);
    return result.users as AdminUser[];
  }, []);

  const fetchData = useCallback(async () => {
    const { data: result, error: fnError } = await supabase.functions.invoke("admin-dashboard", { body: { section: "data" } });
    if (fnError) throw fnError;
    if (result?.error) throw new Error(result.error);
    return result as DashboardData;
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isAdmin) { navigate("/"); return; }
    setLoading(true);
    fetchUsers()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [authLoading, user, isAdmin, fetchUsers, navigate]);

  useEffect(() => {
    if (tab === "data" && !dataLoaded && isAdmin) {
      setRefreshing(true);
      fetchData().then((d) => { setData(d); setDataLoaded(true); }).catch(console.error).finally(() => setRefreshing(false));
    }
  }, [tab, dataLoaded, isAdmin, fetchData]);

  const userRows = useMemo(() => {
    return users.map((u) => {
      const initials = (u.display_name ?? u.email ?? "?")
        .split(" ")
        .map((word) => word[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      const joined = new Date(u.created_at);
      const joinedLabel = isNaN(joined.getTime()) ? "—" : joined.toLocaleDateString();
      const lastSeen = u.last_sign_in_at ? new Date(u.last_sign_in_at) : null;
      const lastSeenLabel = lastSeen && !isNaN(lastSeen.getTime()) ? lastSeen.toLocaleDateString() : null;

      return { ...u, initials, joinedLabel, lastSeenLabel };
    });
  }, [users]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (tab === "users") { setUsers(await fetchUsers()); }
      else { setData(await fetchData()); }
    } catch (e) { console.error("Refresh failed", e); }
    finally { setRefreshing(false); }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke("admin-dashboard", {
        body: { action: "delete_user", user_id: deleteTarget.id },
      });
      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      toast.success(`Deleted ${deleteTarget.email}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
    finally { setDeleting(false); setDeleteTarget(null); }
  };

  const handleNukeAllData = async () => {
    setNuking(true);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke("admin-dashboard", {
        body: { action: "delete_all_data" },
      });
      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);
      toast.success(`All data deleted. ${result.deletedUsers} users removed.${result.errors?.length ? ` ${result.errors.length} warnings.` : ""}`);
      setUsers([]);
      setData(null);
      setDataLoaded(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
    finally { setNuking(false); setNukeOpen(false); setNukeConfirmText(""); }
  };

  const refreshButton = (
    <button
      onClick={handleRefresh}
      disabled={refreshing}
      className="text-[13px] font-sans font-bold tracking-[0.15em] uppercase text-muted-foreground/30 hover:text-foreground transition-colors disabled:opacity-50"
    >
      {refreshing ? "Refreshing…" : "Refresh"}
    </button>
  );

  if (authLoading || loading) {
    return <PageLayout subtitle="Admin"><div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={24} /></div></PageLayout>;
  }
  if (error) {
    return <PageLayout subtitle="Admin"><div className="flex-1 flex items-center justify-center px-4"><p className="text-destructive text-sm">{error}</p></div></PageLayout>;
  }

  return (
    <PageLayout subtitle="Admin" headerRight={refreshButton}>
    <div className="px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap gap-x-4 gap-y-1 max-w-3xl mb-2">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="artists">Artists</TabsTrigger>
            <TabsTrigger value="verify">Verify</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
            <TabsTrigger value="copy">Copy</TabsTrigger>
            <TabsTrigger value="prompts">AI</TabsTrigger>
            <TabsTrigger value="css">CSS</TabsTrigger>
          </TabsList>

          {/* ── USERS TAB ── */}
          <TabsContent value="users" className="mt-4">
            <div className="glass-card rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-primary" />
                  <span className="text-sm font-mono font-medium">All Users</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setNukeOpen(true)}
                    className="flex items-center gap-1.5 text-[11px] font-mono font-bold tracking-wider uppercase text-destructive/60 hover:text-destructive transition-colors"
                  >
                    <Bomb size={12} />
                    Delete All Data
                  </button>
                  <span className="text-xs font-mono text-muted-foreground">{users.length} total</span>
                </div>
              </div>

              {/* Table header */}
              <div className="hidden sm:grid grid-cols-[1fr_1fr_70px_60px_60px_70px_90px_36px] gap-2 px-4 py-2 border-b border-border text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                <span>User</span>
                <span>Email</span>
                <span>Role</span>
                <span>Tier</span>
                <span>Fits</span>
                <span>Clicks</span>
                <span>Joined</span>
                <span></span>
              </div>

              <div className="divide-y divide-border max-h-[65vh] overflow-y-auto">
                {userRows.map((u) => {
                  const initials = (u.display_name || "?").slice(0, 2).toUpperCase();
                  return (
                    <div key={u.id}>
                      <div className="px-4 py-3 flex flex-col sm:grid sm:grid-cols-[1fr_1fr_70px_60px_60px_70px_90px_36px] gap-2 sm:items-center transition-colors group hover:bg-muted/30">
                        {/* User */}
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-7 w-7 flex-shrink-0">
                            <AvatarImage src={u.avatar_url ?? undefined} />
                            <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">{initials}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{u.display_name || "—"}</p>
                            {u.provider !== "email" && <span className="text-[10px] text-muted-foreground capitalize">{u.provider}</span>}
                          </div>
                        </div>

                        {/* Email */}
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>

                        {/* Role */}
                        <Badge variant={u.role === "artist" ? "default" : u.role === "curator" ? "secondary" : "outline"} className="text-[10px] w-fit capitalize">
                          {u.role}
                        </Badge>

                        {/* Tier (unlimited toggle) */}
                        {u.id !== "__anonymous__" ? (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              const prev = u.is_unlimited;
                              setUsers((p) => p.map((x) => x.id === u.id ? { ...x, is_unlimited: !prev } : x));
                              try {
                                const { data: result, error: fnErr } = await supabase.functions.invoke("admin-dashboard", {
                                  body: { action: "toggle_unlimited", user_id: u.id },
                                });
                                if (fnErr || result?.error) throw fnErr || new Error(result.error);
                                toast.success(result.is_unlimited ? "Set to unlimited" : "Set to limited");
                              } catch {
                                setUsers((p) => p.map((x) => x.id === u.id ? { ...x, is_unlimited: prev } : x));
                                toast.error("Failed to update tier");
                              }
                            }}
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded cursor-pointer transition-colors ${u.is_unlimited ? "bg-primary/20 text-primary font-semibold" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                            title={u.is_unlimited ? "Click to set limited" : "Click to set unlimited"}
                          >
                            {u.is_unlimited ? "∞" : "ltd"}
                          </button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}

                        {/* PlaylistFit checks */}
                        <span className="text-sm font-mono">{u.fit_checks}</span>

                        {/* Clicks */}
                        <div className="flex items-center gap-1">
                          {u.engagement.total > 0 ? (
                            <>
                              <MousePointerClick size={12} className="text-primary flex-shrink-0" />
                              <span className="text-sm font-mono font-medium text-primary">{u.engagement.total}</span>
                            </>
                          ) : (
                            <span className="text-sm font-mono text-muted-foreground/40">0</span>
                          )}
                        </div>

                        {/* Joined */}
                        <div className="text-xs text-muted-foreground font-mono">
                          <div>{u.joinedLabel}</div>
                          {u.lastSeenLabel && <div className="text-[10px] opacity-60" title="Last sign in">seen {u.lastSeenLabel}</div>}
                        </div>

                        {/* Delete */}
                        {u.id !== "__anonymous__" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(u); }}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete user"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* ── ARTISTS TAB ── */}
          <TabsContent value="artists" className="mt-4">
            {tab === "artists" && (
              <Suspense fallback={<div className="py-10 flex justify-center"><Loader2 className="animate-spin text-primary" size={20} /></div>}>
                <FmlyArtists />
              </Suspense>
            )}
          </TabsContent>

          {/* ── VERIFY TAB ── */}
          <TabsContent value="verify" className="mt-4">
            {tab === "verify" && (
              <Suspense fallback={<div className="py-10 flex justify-center"><Loader2 className="animate-spin text-primary" size={20} /></div>}>
                <PendingVerifications />
              </Suspense>
            )}
          </TabsContent>

          {/* ── DATA TAB ── */}
          <TabsContent value="data" className="mt-4 space-y-6">
            {refreshing && !data ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-primary" size={20} /></div>
            ) : (
              <>
                <div className="flex gap-3 text-xs font-mono text-muted-foreground">
                  <span>{data?.totalSearches ?? 0} fits checked</span>
                </div>

                {/* Check Fits */}
                <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                    <Search size={14} className="text-primary" />
                    <span className="text-sm font-mono font-medium">Check Fits</span>
                  </div>
                  {data?.checkFits && data.checkFits.length > 0 ? (
                    <div className="divide-y divide-border">
                      {data.checkFits.map((fit, i) => (
                        <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{fit.playlist_name || fit.playlist_url || "—"}</p>
                            {fit.song_name && <p className="text-xs text-muted-foreground truncate">× {fit.song_name}</p>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {fit.count > 1 && <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">×{fit.count}</span>}
                            <span className="text-xs text-muted-foreground font-mono">
                              {(() => { const d = new Date(fit.last_checked || (fit as any).created_at); return isNaN(d.getTime()) ? "—" : d.toLocaleDateString(); })()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">No PlaylistFit checks yet.</div>
                  )}
                </motion.div>
              </>
            )}
          </TabsContent>

          {/* ── TOOLS TAB ── */}
          <TabsContent value="tools" className="mt-4">
            {tab === "tools" && (
              <Suspense fallback={<div className="py-10 flex justify-center"><Loader2 className="animate-spin text-primary" size={20} /></div>}>
                <ToolsEditor />
              </Suspense>
            )}
          </TabsContent>

          {/* ── COPY TAB ── */}
          <TabsContent value="copy" className="mt-4 space-y-6">
            {tab === "copy" && (
              <Suspense fallback={<div className="py-10 flex justify-center"><Loader2 className="animate-spin text-primary" size={20} /></div>}>
                <CopyEditor />
              </Suspense>
            )}
          </TabsContent>

          {/* ── AI PROMPTS TAB ── */}
          <TabsContent value="prompts" className="mt-4">
            {tab === "prompts" && (
              <Suspense fallback={<div className="py-10 flex justify-center"><Loader2 className="animate-spin text-primary" size={20} /></div>}>
                <AiPromptsEditor />
              </Suspense>
            )}
          </TabsContent>

          {/* ── CSS TAB ── */}
          <TabsContent value="css" className="mt-4">
            {tab === "css" && (
              <Suspense fallback={<div className="py-10 flex justify-center"><Loader2 className="animate-spin text-primary" size={20} /></div>}>
                <GlobalCssEditor />
              </Suspense>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete user confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.email}</strong> and all their data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Nuke all data confirmation */}
      <AlertDialog open={nukeOpen} onOpenChange={(open) => { if (!open) { setNukeOpen(false); setNukeConfirmText(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <Bomb size={18} /> Delete ALL data?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">This will permanently delete <strong>all rows from every table</strong> and <strong>all users except you</strong>. This cannot be undone.</span>
              <span className="block text-destructive font-medium">Type "DELETE" to confirm:</span>
              <input
                type="text"
                value={nukeConfirmText}
                onChange={(e) => setNukeConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full bg-background border border-destructive/30 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-destructive"
                autoFocus
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={nuking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleNukeAllData}
              disabled={nuking || nukeConfirmText !== "DELETE"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
            >
              {nuking ? "Deleting everything…" : "Delete All Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </PageLayout>
  );
}
