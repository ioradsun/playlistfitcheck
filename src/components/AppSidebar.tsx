import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Music,
  Users,
  BarChart3,
  ListMusic,
  Sliders,
  FileText,
  Target,
  Sparkles,
  Bell,
  LogOut,
  User,
  Shield,
  Info,
  Heart,
  MessageCircle,
  UserPlus,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";

const ADMIN_EMAILS = ["sunpatel@gmail.com", "spatel@iorad.com"];

interface ToolItem {
  value: string;
  label: string;
  path: string;
  icon: typeof Music;
}

const TOOLS: ToolItem[] = [
  { value: "songfit", label: "CrowdFit", path: "/SongFit", icon: Users },
  { value: "profit", label: "ProFit", path: "/ProFit", icon: BarChart3 },
  { value: "playlist", label: "PlaylistFit", path: "/PlaylistFit", icon: ListMusic },
  { value: "mix", label: "MixFit", path: "/MixFit", icon: Sliders },
  { value: "lyric", label: "LyricFit", path: "/LyricFit", icon: FileText },
  { value: "hitfit", label: "HitFit", path: "/HitFit", icon: Target },
  { value: "dreamfit", label: "DreamFit", path: "/DreamFit", icon: Sparkles },
];

const NOTI_ICON_MAP = {
  like: { icon: Heart, className: "text-red-500 fill-red-500" },
  comment: { icon: MessageCircle, className: "text-blue-400" },
  follow: { icon: UserPlus, className: "text-primary" },
};

export interface RecentItem {
  id: string;
  label: string;
  meta: string;
  type: string;
  rawData?: any;
}

export interface AppSidebarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onNewProject?: () => void;
  onLoadProject?: (type: string, data: any) => void;
  refreshKey?: number;
}

export { TOOLS };

export function AppSidebar({ activeTab, onTabChange, onLoadProject, refreshKey }: AppSidebarProps) {
  const { user, loading: authLoading, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { state: sidebarState, setOpenMobile, isMobile } = useSidebar();
  const collapsed = sidebarState === "collapsed";
  const { notifications, unreadCount, loading: notiLoading, markAllRead, refetch: refetchNotifications } = useNotifications();

  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  

  const fetchRecents = useCallback(async () => {
    if (!user) return;
    const items: RecentItem[] = [];

    const { data: reports } = await supabase
      .from("profit_reports")
      .select("id, created_at, artist_id, profit_artists!inner(name, spotify_artist_id)")
      .order("created_at", { ascending: false })
      .limit(5);
    if (reports) {
      reports.forEach((r: any) => {
        items.push({
          id: r.id,
          label: r.profit_artists?.name || "Artist Report",
          meta: formatDistanceToNow(new Date(r.created_at), { addSuffix: true }),
          type: "profit",
          rawData: { spotify_artist_id: r.profit_artists?.spotify_artist_id },
        });
      });
    }

    const { data: searches } = await supabase
      .from("saved_searches")
      .select("id, playlist_name, playlist_url, song_url, report_data, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);
    if (searches) {
      searches.forEach((s: any) => {
        items.push({
          id: s.id,
          label: s.playlist_name || "Playlist Analysis",
          meta: formatDistanceToNow(new Date(s.created_at), { addSuffix: true }),
          type: "playlist",
          rawData: { report_data: s.report_data, playlist_url: s.playlist_url, song_url: s.song_url },
        });
      });
    }

    const { data: mixes } = await supabase
      .from("mix_projects")
      .select("id, title, notes, mixes, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (mixes) {
      mixes.forEach((m: any) => {
        items.push({
          id: m.id,
          label: m.title || "Mix Project",
          meta: formatDistanceToNow(new Date(m.updated_at), { addSuffix: true }),
          type: "mix",
          rawData: m,
        });
      });
    }

    const { data: lyrics } = await supabase
      .from("saved_lyrics")
      .select("id, title, artist, lines, filename, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (lyrics) {
      lyrics.forEach((l: any) => {
        items.push({
          id: l.id,
          label: `${l.title || "Untitled"} – ${l.artist || "Unknown"}`,
          meta: formatDistanceToNow(new Date(l.updated_at), { addSuffix: true }),
          type: "lyric",
          rawData: l,
        });
      });
    }

    setRecentItems(items);
  }, [user]);

  useEffect(() => {
    fetchRecents();
  }, [fetchRecents, refreshKey]);

  const closeMobileIfNeeded = () => {
    if (isMobile) setOpenMobile(false);
  };

  const handleToolClick = (tool: ToolItem) => {
    onTabChange?.(tool.value);
    navigate(tool.path);
    closeMobileIfNeeded();
  };

  const handleRecentClick = (item: RecentItem) => {
    onTabChange?.(item.type);
    const tool = TOOLS.find(t => t.value === item.type);
    if (tool) navigate(tool.path);
    onLoadProject?.(item.type, item.rawData);
    closeMobileIfNeeded();
  };

  const handleDeleteRecent = async (item: RecentItem) => {
    if (item.type === "profit") await supabase.from("profit_reports").delete().eq("id", item.id);
    else if (item.type === "playlist") await supabase.from("saved_searches").delete().eq("id", item.id);
    else if (item.type === "mix") await supabase.from("mix_projects").delete().eq("id", item.id);
    else if (item.type === "lyric") await supabase.from("saved_lyrics").delete().eq("id", item.id);
    setRecentItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  const handleRenameRecent = async (item: RecentItem) => {
    const name = editLabel.trim();
    if (!name) return;
    if (item.type === "mix") await supabase.from("mix_projects").update({ title: name }).eq("id", item.id);
    else if (item.type === "lyric") await supabase.from("saved_lyrics").update({ title: name }).eq("id", item.id);
    else if (item.type === "playlist") await supabase.from("saved_searches").update({ playlist_name: name }).eq("id", item.id);
    setRecentItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, label: name } : i))
    );
    setEditingId(null);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const initials = (profile?.display_name ?? user?.email ?? "?")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const recentByType = TOOLS.reduce((acc, tool) => {
    acc[tool.value] = recentItems.filter(i => i.type === tool.value);
    return acc;
  }, {} as Record<string, RecentItem[]>);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="pb-0">
        <div className="flex items-center gap-2 px-2 py-1">
          <Music size={18} className="text-primary shrink-0" />
          {!collapsed && (
            <span className="font-mono text-sm font-bold text-primary">tools.fm</span>
          )}
        </div>
        {!authLoading && !user && (
          <div className="px-2 mt-2 space-y-1">
            <button
              onClick={() => { navigate("/auth"); closeMobileIfNeeded(); }}
              className="w-full px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              {collapsed ? <UserPlus size={14} className="mx-auto" /> : "Sign Up / Log In"}
            </button>
          </div>
        )}
      </SidebarHeader>

      <SidebarSeparator className="my-2" />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {TOOLS.map((tool) => {
                const isActive = activeTab
                  ? activeTab === tool.value
                  : location.pathname === tool.path;
                const recents = recentByType[tool.value] || [];

                return (
                  <SidebarMenuItem key={tool.value}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={tool.label}
                      onClick={() => handleToolClick(tool)}
                    >
                      <tool.icon size={16} />
                      <span>{tool.label}</span>
                    </SidebarMenuButton>

                    {!collapsed && isActive && recents.length > 0 && (
                      <ul className="ml-6 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
                        {recents.map((item) => (
                          <li key={item.id} className="group flex items-center gap-0.5">
                            {editingId === item.id ? (
                              <form
                                className="flex-1 min-w-0"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  handleRenameRecent(item);
                                }}
                              >
                                <input
                                  autoFocus
                                  className="w-full px-2 py-1 text-xs bg-sidebar-accent rounded-md border border-sidebar-border outline-none"
                                  value={editLabel}
                                  onChange={(e) => setEditLabel(e.target.value)}
                                  onBlur={() => setEditingId(null)}
                                  onKeyDown={(e) => e.key === "Escape" && setEditingId(null)}
                                />
                              </form>
                            ) : (
                              <>
                                <button
                                  className="flex-1 min-w-0 text-left px-2 py-1 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-md truncate transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRecentClick(item);
                                  }}
                                  title={item.label}
                                >
                                  <span className="block truncate">{item.label}</span>
                                  <span className="text-[10px] text-muted-foreground">{item.meta}</span>
                                </button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded hover:bg-sidebar-accent transition-opacity"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MoreHorizontal size={12} className="text-muted-foreground" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-32">
                                    {item.type !== "profit" && (
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditLabel(item.label);
                                          setEditingId(item.id);
                                        }}
                                      >
                                        <Pencil size={12} className="mr-2" />
                                        Rename
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteRecent(item);
                                      }}
                                    >
                                      <Trash2 size={12} className="mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="tools.fm story"
                  isActive={location.pathname === "/about"}
                  onClick={() => { navigate("/about"); closeMobileIfNeeded(); }}
                >
                  <Info size={16} />
                  <span>tools.fm story</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Terms"
                  isActive={location.pathname === "/terms"}
                  onClick={() => { navigate("/terms"); closeMobileIfNeeded(); }}
                >
                  <FileText size={16} />
                  <span>Terms</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {authLoading ? null : user ? (
          <div className="space-y-1">
            <button
              onClick={() => setProfileExpanded(!profileExpanded)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-sidebar-accent transition-colors"
            >
              <div className="relative shrink-0">
                <Avatar className="h-7 w-7 border border-sidebar-border">
                  <AvatarImage
                    src={profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined}
                    alt={profile?.display_name ?? "Avatar"}
                  />
                  <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 min-w-4 px-0.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground ring-2 ring-sidebar">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </div>
              {!collapsed && (
                <>
                  <span className="text-xs font-medium truncate flex-1 text-left">
                    {profile?.display_name ?? user.email?.split("@")[0]}
                  </span>
                  <ChevronDown size={14} className={`text-muted-foreground transition-transform ${profileExpanded ? "rotate-180" : ""}`} />
                </>
              )}
            </button>
            {!collapsed && profileExpanded && (
              <div className="space-y-0.5 pl-2">
                {/* Notifications inline */}
                <div className="px-2 py-1">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-[11px] text-primary hover:underline mb-1 block"
                    >
                      Mark all read
                    </button>
                  )}
                  {notiLoading ? (
                    <p className="text-[11px] text-muted-foreground py-1">Loading...</p>
                  ) : notifications.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground py-1">No notifications</p>
                  ) : (
                    <div className="space-y-0.5 max-h-40 overflow-y-auto">
                      {notifications.slice(0, 6).map((n) => {
                        const { icon: NIcon, className: nClass } = NOTI_ICON_MAP[n.type as keyof typeof NOTI_ICON_MAP] || NOTI_ICON_MAP.like;
                        const actorName = n.actor?.display_name || "Someone";
                        let text = "";
                        if (n.type === "like") text = "liked your post";
                        else if (n.type === "comment") text = "commented";
                        else if (n.type === "follow") text = "followed you";

                        return (
                          <div
                            key={n.id}
                            className={`flex items-start gap-2 px-1.5 py-1 rounded-md text-[11px] ${!n.is_read ? "bg-primary/5" : ""}`}
                          >
                            <button
                              onClick={() => { navigate(`/u/${n.actor_user_id}`); closeMobileIfNeeded(); }}
                              className="w-4 h-4 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 mt-0.5 hover:ring-1 hover:ring-primary transition-all"
                            >
                              {n.actor?.avatar_url ? (
                                <img src={n.actor.avatar_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <User size={8} className="text-muted-foreground" />
                              )}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className="leading-tight truncate">
                                <button
                                  onClick={() => { navigate(`/u/${n.actor_user_id}`); closeMobileIfNeeded(); }}
                                  className="font-medium hover:underline"
                                >
                                  {actorName}
                                </button>{" "}
                                <span className="text-muted-foreground">{text}</span>
                              </p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <NIcon size={9} className={nClass} />
                                <span className="text-[9px] text-muted-foreground">
                                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <SidebarSeparator className="my-1" />

                <button
                  onClick={() => { navigate("/profile"); closeMobileIfNeeded(); }}
                  className="flex items-center gap-2 w-full px-2 py-1 rounded-md text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                >
                  <User size={14} />
                  <span>Profile</span>
                </button>
                {ADMIN_EMAILS.includes(user.email ?? "") && (
                  <button
                    onClick={() => { navigate("/admin"); closeMobileIfNeeded(); }}
                    className="flex items-center gap-2 w-full px-2 py-1 rounded-md text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                  >
                    <Shield size={14} />
                    <span>Admin</span>
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-2 py-1 rounded-md text-xs text-destructive hover:bg-sidebar-accent transition-colors"
                >
                  <LogOut size={14} />
                  <span>Log out</span>
                </button>
              </div>
            )}
          </div>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}