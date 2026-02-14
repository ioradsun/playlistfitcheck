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
  Plus,
  Users,
  BarChart3,
  ListMusic,
  Sliders,
  FileText,
  Target,
  Bell,
  LogOut,
  User,
  Shield,
  BookOpen,
  Heart,
  MessageCircle,
  UserPlus,
} from "lucide-react";
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
  rawData?: any; // raw DB row for loading
}

export interface AppSidebarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onNewProject?: () => void;
  onLoadProject?: (type: string, data: any) => void;
}

export function AppSidebar({ activeTab, onTabChange, onNewProject, onLoadProject }: AppSidebarProps) {
  const { user, loading: authLoading, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { state: sidebarState } = useSidebar();
  const collapsed = sidebarState === "collapsed";
  const { notifications, unreadCount, loading: notiLoading, markAllRead, refetch: refetchNotifications } = useNotifications();

  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);

  const fetchRecents = useCallback(async () => {
    if (!user) return;
    const items: RecentItem[] = [];

    // ProFit reports — need spotify_artist_id to re-trigger analysis
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

    // Saved searches (PlaylistFit) — need report_data, playlist_url, song_url
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

    // Mix projects — need full project data
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

    // Saved lyrics — need full lyric data
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
  }, [fetchRecents]);

  const handleToolClick = (tool: ToolItem) => {
    onTabChange?.(tool.value);
    navigate(tool.path);
  };

  const handleRecentClick = (item: RecentItem) => {
    // Switch to the tool tab
    onTabChange?.(item.type);
    const tool = TOOLS.find(t => t.value === item.type);
    if (tool) navigate(tool.path);
    // Emit load event
    onLoadProject?.(item.type, item.rawData);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const initials = (profile?.display_name ?? user?.email ?? "?")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  // Group recent items by tool type
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
        {!collapsed && (
          <button
            onClick={() => onNewProject?.()}
            className="mx-2 mt-2 flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
          >
            <Plus size={16} />
            <span>New Project</span>
          </button>
        )}
        {collapsed && (
          <button
            onClick={() => onNewProject?.()}
            className="mx-auto mt-1 flex items-center justify-center rounded-md p-2 text-foreground hover:bg-secondary transition-colors"
            title="New Project"
          >
            <Plus size={16} />
          </button>
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
                          <li key={item.id}>
                            <button
                              className="w-full text-left px-2 py-1 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-md truncate transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRecentClick(item);
                              }}
                              title={item.label}
                            >
                              <span className="block truncate">{item.label}</span>
                              <span className="text-[10px] text-muted-foreground">{item.meta}</span>
                            </button>
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

        {!authLoading && user && (
          <SidebarGroup>
            <SidebarGroupLabel>
              <span className="flex items-center gap-2">
                Notifications
                {unreadCount > 0 && (
                  <span className="flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {!collapsed && (
                <div className="px-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-[11px] text-primary hover:underline mb-1"
                    >
                      Mark all read
                    </button>
                  )}
                  {notiLoading ? (
                    <p className="text-xs text-muted-foreground py-2">Loading...</p>
                  ) : notifications.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No notifications</p>
                  ) : (
                    <div className="space-y-0.5 max-h-48 overflow-y-auto">
                      {notifications.slice(0, 8).map((n) => {
                        const { icon: NIcon, className: nClass } = NOTI_ICON_MAP[n.type as keyof typeof NOTI_ICON_MAP] || NOTI_ICON_MAP.like;
                        const actorName = n.actor?.display_name || "Someone";
                        let text = "";
                        if (n.type === "like") text = "liked your post";
                        else if (n.type === "comment") text = "commented";
                        else if (n.type === "follow") text = "followed you";

                        return (
                          <div
                            key={n.id}
                            className={`flex items-start gap-2 px-2 py-1.5 rounded-md text-xs ${!n.is_read ? "bg-primary/5" : ""}`}
                          >
                            <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 mt-0.5">
                              {n.actor?.avatar_url ? (
                                <img src={n.actor.avatar_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <User size={10} className="text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="leading-tight truncate">
                                <span className="font-medium">{actorName}</span>{" "}
                                <span className="text-muted-foreground">{text}</span>
                              </p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <NIcon size={10} className={nClass} />
                                <span className="text-[10px] text-muted-foreground">
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
              )}
              {collapsed && (
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip={`Notifications${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
                      onClick={() => refetchNotifications()}
                    >
                      <div className="relative">
                        <Bell size={16} />
                        {unreadCount > 0 && (
                          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-destructive text-[8px] font-bold text-destructive-foreground flex items-center justify-center">
                            {unreadCount > 9 ? "+" : unreadCount}
                          </span>
                        )}
                      </div>
                      <span>Notifications</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Our Story"
                  isActive={location.pathname === "/our-story"}
                  onClick={() => navigate("/our-story")}
                >
                  <BookOpen size={16} />
                  <span>Our Story</span>
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
              onClick={() => navigate("/profile")}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-sidebar-accent transition-colors"
            >
              <Avatar className="h-7 w-7 border border-sidebar-border shrink-0">
                <AvatarImage
                  src={profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined}
                  alt={profile?.display_name ?? "Avatar"}
                />
                <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <span className="text-xs font-medium truncate flex-1 text-left">
                  {profile?.display_name ?? user.email?.split("@")[0]}
                </span>
              )}
            </button>
            {!collapsed && ADMIN_EMAILS.includes(user.email ?? "") && (
              <button
                onClick={() => navigate("/admin")}
                className="flex items-center gap-2 w-full px-2 py-1 rounded-md text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent transition-colors"
              >
                <Shield size={14} />
                <span>Admin</span>
              </button>
            )}
            {!collapsed && (
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 w-full px-2 py-1 rounded-md text-xs text-destructive hover:bg-sidebar-accent transition-colors"
              >
                <LogOut size={14} />
                <span>Log out</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <button
              onClick={() => navigate("/auth")}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs font-medium hover:bg-sidebar-accent transition-colors"
            >
              <User size={16} />
              {!collapsed && <span>Log in</span>}
            </button>
            {!collapsed && (
              <button
                onClick={() => navigate("/auth?mode=signup")}
                className="w-full px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Sign Up For Free
              </button>
            )}
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
