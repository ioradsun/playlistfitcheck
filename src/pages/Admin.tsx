import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BarChart3, Search, RefreshCw, Loader2, Users, Database, Trash2, MousePointerClick, FileText, Coins, Bot, Rocket, CheckCircle2 } from "lucide-react";
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
import { CopyEditor } from "@/components/admin/CopyEditor";
import { Switch } from "@/components/ui/switch";
import { AiPromptsEditor } from "@/components/admin/AiPromptsEditor";
import { PendingVerifications } from "@/components/admin/PendingVerifications";
interface CheckFit { playlist_name: string | null; playlist_url: string | null; song_name: string | null; song_url: string | null; count: number; last_checked: string; }
interface DashboardData { totalEngagements: number; totalSearches: number; checkFits: CheckFit[]; }

interface AdminUser {
  id: string; email: string; display_name: string | null; avatar_url: string | null;
  role: string; fit_checks: number; created_at: string; last_sign_in_at: string | null; provider: string;
  engagement: { total: number };
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
  const [cryptoEnabled, setCryptoEnabled] = useState(false);
  const [savingCrypto, setSavingCrypto] = useState(false);
  const [growthEnabled, setGrowthEnabled] = useState(false);
  const [savingGrowth, setSavingGrowth] = useState(false);
  const [guestQuota, setGuestQuota] = useState(5);
  const [limitedQuota, setLimitedQuota] = useState(10);
  const [savingQuotas, setSavingQuotas] = useState(false);
  const isAdmin = ADMIN_EMAILS.includes(user?.email ?? "");

  const fetchUsers = async () => {
    const { data: result, error: fnError } = await supabase.functions.invoke("admin-dashboard", { body: { section: "users" } });
    if (fnError) throw fnError;
    if (result?.error) throw new Error(result.error);
    return result.users as AdminUser[];
  };

  const fetchData = async () => {
    const { data: result, error: fnError } = await supabase.functions.invoke("admin-dashboard", { body: { section: "data" } });
    if (fnError) throw fnError;
    if (result?.error) throw new Error(result.error);
    return result as DashboardData;
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isAdmin) { navigate("/"); return; }
    setLoading(true);
    fetchUsers()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [authLoading, user, isAdmin]);

  useEffect(() => {
    if (tab === "data" && !dataLoaded && isAdmin) {
      setRefreshing(true);
      fetchData().then((d) => { setData(d); setDataLoaded(true); }).catch(console.error).finally(() => setRefreshing(false));
    }
    if (tab === "copy" && isAdmin) {
      supabase.from("site_copy").select("copy_json").limit(1).single()
        .then(({ data: r }) => {
          if (r?.copy_json) {
            if ((r.copy_json as any).features?.crypto_tipping) setCryptoEnabled(true);
            if ((r.copy_json as any).features?.growth_flow) setGrowthEnabled(true);
            const q = (r.copy_json as any).features?.growth_quotas;
            if (q?.guest) setGuestQuota(q.guest);
            if (q?.limited) setLimitedQuota(q.limited);
          }
        });
    }
  }, [tab, dataLoaded, isAdmin]);

  const handleToggleCrypto = async (enabled: boolean) => {
    setCryptoEnabled(enabled);
    setSavingCrypto(true);
    try {
      const { data: existing } = await supabase.from("site_copy").select("id, copy_json").limit(1).single();
      if (existing) {
        const updated = { ...(existing.copy_json as any), features: { ...((existing.copy_json as any).features || {}), crypto_tipping: enabled } };
        await supabase.functions.invoke("admin-dashboard", { body: { action: "update_site_copy", copy_json: updated } });
        window.dispatchEvent(new CustomEvent("site-copy-updated"));
      }
      toast.success(enabled ? "Crypto tipping enabled" : "Crypto tipping disabled");
    } catch (e) {
      setCryptoEnabled(!enabled);
      toast.error("Failed to update");
    } finally {
      setSavingCrypto(false);
    }
  };

  const handleToggleGrowth = async (enabled: boolean) => {
    setGrowthEnabled(enabled);
    setSavingGrowth(true);
    try {
      const { data: existing } = await supabase.from("site_copy").select("id, copy_json").limit(1).single();
      if (existing) {
        const updated = { ...(existing.copy_json as any), features: { ...((existing.copy_json as any).features || {}), growth_flow: enabled } };
        await supabase.functions.invoke("admin-dashboard", { body: { action: "update_site_copy", copy_json: updated } });
        window.dispatchEvent(new CustomEvent("site-copy-updated"));
      }
      toast.success(enabled ? "Growth flow enabled" : "Growth flow disabled");
    } catch (e) {
      setGrowthEnabled(!enabled);
      toast.error("Failed to update");
    } finally {
      setSavingGrowth(false);
    }
  };

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

  if (authLoading || loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={24} /></div>;
  }
  if (error) {
    return <div className="min-h-screen bg-background flex items-center justify-center px-4"><p className="text-destructive text-sm">{error}</p></div>;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <BarChart3 size={20} className="text-primary" />
          <h1 className="text-xl font-bold">Admin Dashboard</h1>
          <button onClick={handleRefresh} disabled={refreshing} className="ml-auto p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-50" title="Refresh">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full max-w-xl grid-cols-5">
            <TabsTrigger value="users" className="gap-1.5"><Users size={14} /> Users</TabsTrigger>
            <TabsTrigger value="verify" className="gap-1.5"><CheckCircle2 size={14} /> Verify</TabsTrigger>
            <TabsTrigger value="data" className="gap-1.5"><Database size={14} /> Data</TabsTrigger>
            <TabsTrigger value="copy" className="gap-1.5"><FileText size={14} /> Copy</TabsTrigger>
            <TabsTrigger value="prompts" className="gap-1.5"><Bot size={14} /> AI Prompts</TabsTrigger>
          </TabsList>

          {/* ── USERS TAB ── */}
          <TabsContent value="users" className="mt-4">
            <div className="glass-card rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-primary" />
                  <span className="text-sm font-mono font-medium">All Users</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{users.length} total</span>
              </div>

              {/* Table header */}
              <div className="hidden sm:grid grid-cols-[1fr_1fr_70px_60px_70px_90px_36px] gap-2 px-4 py-2 border-b border-border text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                <span>User</span>
                <span>Email</span>
                <span>Role</span>
                <span>Fits</span>
                <span>Clicks</span>
                <span>Joined</span>
                <span></span>
              </div>

              <div className="divide-y divide-border max-h-[65vh] overflow-y-auto">
                {users.map((u) => {
                  const initials = (u.display_name ?? u.email ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                  const joined = new Date(u.created_at);
                  const lastSeen = u.last_sign_in_at ? new Date(u.last_sign_in_at) : null;

                  return (
                    <div key={u.id}>
                      <div className="px-4 py-3 flex flex-col sm:grid sm:grid-cols-[1fr_1fr_70px_60px_70px_90px_36px] gap-2 sm:items-center transition-colors group hover:bg-muted/30">
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
                          <div>{joined.toLocaleDateString()}</div>
                          {lastSeen && <div className="text-[10px] opacity-60" title="Last sign in">seen {lastSeen.toLocaleDateString()}</div>}
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

          {/* ── COPY TAB ── */}
          <TabsContent value="copy" className="mt-4 space-y-6">
            <CopyEditor />

            {/* Crypto Tipping Toggle */}
            <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Coins size={14} className="text-purple-400" />
                <span className="text-sm font-mono font-medium">Crypto Tipping</span>
              </div>
              <div className="px-4 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">$DEGEN tipping on CrowdFit</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Show tip button on all posts (Base chain)</p>
                </div>
                <Switch
                  checked={cryptoEnabled}
                  onCheckedChange={handleToggleCrypto}
                  disabled={savingCrypto}
                />
              </div>
            </motion.div>

            {/* Product-Led Growth Toggle */}
            <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Rocket size={14} className="text-primary" />
                <span className="text-sm font-mono font-medium">Product-Led Growth</span>
              </div>
              <div className="px-4 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Usage quotas + invite-to-unlock</p>
                  <p className="text-xs text-muted-foreground mt-0.5">toolsFM widget with usage tracking</p>
                </div>
                <Switch
                  checked={growthEnabled}
                  onCheckedChange={handleToggleGrowth}
                  disabled={savingGrowth}
                />
              </div>

              {/* Quota settings */}
              {growthEnabled && (
                <div className="px-4 pb-4 pt-1 border-t border-border space-y-3">
                  <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Quotas (uses per tool)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Guest</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={guestQuota}
                        onChange={(e) => setGuestQuota(Number(e.target.value))}
                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Limited (signed up)</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={limitedQuota}
                        onChange={(e) => setLimitedQuota(Number(e.target.value))}
                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] text-muted-foreground flex-1">Unlimited = invite converts</p>
                    <button
                      onClick={async () => {
                        setSavingQuotas(true);
                        try {
                          const { data: existing } = await supabase.from("site_copy").select("id, copy_json").limit(1).single();
                          if (existing) {
                            const updated = {
                              ...(existing.copy_json as any),
                              features: {
                                ...((existing.copy_json as any).features || {}),
                                growth_quotas: { guest: guestQuota, limited: limitedQuota },
                              },
                            };
                            await supabase.functions.invoke("admin-dashboard", { body: { action: "update_site_copy", copy_json: updated } });
                            window.dispatchEvent(new CustomEvent("site-copy-updated"));
                          }
                          toast.success("Quotas saved");
                        } catch {
                          toast.error("Failed to save quotas");
                        } finally {
                          setSavingQuotas(false);
                        }
                      }}
                      disabled={savingQuotas}
                      className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {savingQuotas ? "Saving…" : "Save Quotas"}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </TabsContent>

          {/* ── VERIFY TAB ── */}
          <TabsContent value="verify" className="mt-4">
            <PendingVerifications />
          </TabsContent>

          {/* ── AI PROMPTS TAB ── */}
          <TabsContent value="prompts" className="mt-4">
            <AiPromptsEditor />
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete confirmation */}
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
              {deleting ? <Loader2 size={14} className="animate-spin mr-1" /> : <Trash2 size={14} className="mr-1" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
