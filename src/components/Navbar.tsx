import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Music, LayoutDashboard } from "lucide-react";

export const Navbar = () => {
  const { user, loading, profile } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const initials = (profile?.display_name ?? user?.email ?? "?")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
        <Link to="/" className="flex items-center gap-2 text-primary font-bold text-lg">
          <Music size={20} />
          <span className="font-mono text-sm">PlaylistFitCheck</span>
        </Link>

        <div className="flex items-center gap-3">
          {loading ? null : user ? (
            <>
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/dashboard")}>
                <LayoutDashboard size={14} /> Dashboard
              </Button>
              <button
                onClick={() => navigate("/profile")}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <Avatar className="h-8 w-8 border border-border">
                  <AvatarImage src={profile?.avatar_url ?? undefined} alt={profile?.display_name ?? "Avatar"} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium hidden sm:inline max-w-[120px] truncate">
                  {profile?.display_name ?? user.email?.split("@")[0]}
                </span>
              </button>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground h-8 w-8">
                <LogOut size={16} />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
                Log in
              </Button>
              <Button size="sm" onClick={() => navigate("/auth?mode=signup")}>
                Sign up free
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};
