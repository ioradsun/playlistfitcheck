import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Music, LayoutDashboard, User, Shield, Bell, BookOpen } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationsPanel } from "@/components/NotificationsPanel";

const ADMIN_EMAILS = ["sunpatel@gmail.com", "spatel@iorad.com"];

interface NavbarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

const TAB_ITEMS = [
  { value: "songfit", label: "CrowdFit", path: "/SongFit" },
  { value: "profit", label: "ProFit", path: "/ProFit" },
  { value: "playlist", label: "PlaylistFit", path: "/PlaylistFit" },
  { value: "mix", label: "MixFit", path: "/MixFit" },
  { value: "lyric", label: "LyricFit", path: "/LyricFit" },
  { value: "hitfit", label: "HitFit", path: "/HitFit" },
];

export const Navbar = ({ activeTab, onTabChange }: NavbarProps) => {
  const { user, loading, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, unreadCount, loading: notiLoading, markAllRead, refetch: refetchNotifications } = useNotifications();
  const [notiOpen, setNotiOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const initials = (profile?.display_name ?? user?.email ?? "?")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
        <Link to="/" className="flex items-center gap-2 text-primary font-bold text-lg shrink-0">
          <Music size={20} />
          <span className="font-mono text-sm">tools.fm</span>
        </Link>

        {/* Tab navigation — always visible */}
        <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none mx-2">
          {TAB_ITEMS.map((tab) => {
            const isActive = activeTab ? activeTab === tab.value : location.pathname === tab.path;
            return (
              <button
                key={tab.value}
                onClick={() => { onTabChange?.(tab.value); navigate(tab.path); }}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => navigate("/our-story")}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors hidden sm:inline-block ${
              location.pathname === "/our-story"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Our Story
          </button>
          {!loading && user && (
            <Popover open={notiOpen} onOpenChange={(open) => { setNotiOpen(open); if (open) refetchNotifications(); }}>
              <PopoverTrigger asChild>
                <button className="relative p-2 rounded-full hover:bg-accent/50 transition-colors">
                  <Bell size={18} className="text-muted-foreground" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="p-0 w-80 border-border z-[100]">
                <NotificationsPanel
                  notifications={notifications}
                  loading={notiLoading}
                  onMarkAllRead={markAllRead}
                  onClose={() => setNotiOpen(false)}
                />
              </PopoverContent>
            </Popover>
          )}
          {loading ? null : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 hover:opacity-80 transition-opacity outline-none">
                  <Avatar className="h-8 w-8 border border-border">
                    <AvatarImage src={profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined} alt={profile?.display_name ?? "Avatar"} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium hidden sm:inline max-w-[120px] truncate">
                    {profile?.display_name ?? user.email?.split("@")[0]}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-card border-border z-[100]">
                <DropdownMenuItem onClick={() => navigate("/dashboard")} className="cursor-pointer gap-2">
                  <LayoutDashboard size={14} /> Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer gap-2">
                  <User size={14} /> Profile
                </DropdownMenuItem>
                {ADMIN_EMAILS.includes(user.email ?? "") && (
                  <DropdownMenuItem onClick={() => navigate("/admin")} className="cursor-pointer gap-2">
                    <Shield size={14} /> Admin
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
                  <LogOut size={14} /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <button
                onClick={() => navigate("/auth", { state: { returnTab: activeTab } })}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  location.pathname === "/auth" && !location.search.includes("mode=signup")
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Log in
              </button>
              <button
                onClick={() => navigate("/auth?mode=signup", { state: { returnTab: activeTab } })}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  location.pathname === "/auth" && location.search.includes("mode=signup")
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign Up For Free
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};
