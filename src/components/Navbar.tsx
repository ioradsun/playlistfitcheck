import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { User, LogOut, Music } from "lucide-react";

export const Navbar = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

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
              <Button variant="ghost" size="sm" onClick={() => navigate("/profile")} className="gap-2">
                <User size={16} />
                Profile
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2 text-muted-foreground">
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
