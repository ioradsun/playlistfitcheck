import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Music, LayoutDashboard, User, Shield, Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationsPanel } from "@/components/NotificationsPanel";

const ADMIN_EMAILS = ["sunpatel@gmail.com", "spatel@iorad.com"];

interface NavbarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

const TAB_ITEMS = [
  { value: "songfit", label: "SongFit" },
  { value: "profit", label: "ProFit" },
  { value: "playlist", label: "PlaylistFit" },
  { value: "mix", label: "MixFit" },
  { value: "lyric", label: "LyricFit" },
  { value: "hitfit", label: "HitFit" },
];

export const Navbar = ({ activeTab, onTabChange }: NavbarProps) => {
  const { user, loading, profile } = useAuth();
  const navigate = useNavigate();
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

        {/* Tab navigation — only shown on Index page */}
        {activeTab && onTabChange && (
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none mx-2">
            {TAB_ITEMS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => onTabChange(tab.value)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  activeTab === tab.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
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
              <Button variant="ghost" size="sm" onClick={() => navigate("/auth", { state: { returnTab: activeTab } })}>
                Log in
              </Button>
              <Button size="sm" onClick={() => navigate("/auth?mode=signup", { state: { returnTab: activeTab } })}>
                Sign Up For Free
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};
