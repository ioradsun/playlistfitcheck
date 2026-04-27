import { useEffect, useState, useCallback, createContext, useContext, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { consumeAuthPrefetch } from "@/lib/prefetch";
import { toast } from "sonner";
import type { User, Session } from "@supabase/supabase-js";
import { useLocation, useNavigate } from "react-router-dom";

interface ProfileData {
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  spotify_embed_url: string | null;
  spotify_artist_id: string | null;
  wallet_address: string | null;
  invite_code: string | null;
  is_unlimited: boolean;
  is_verified: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: string[];
  profile: ProfileData | null;
  refreshProfile: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null, session: null, loading: true, roles: [], profile: null, refreshProfile: () => {},
});

function AuthUrlCleaner() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const hasAuthParam =
      location.search.includes("code=") ||
      location.hash.includes("access_token");
    if (hasAuthParam) {
      navigate("/fmly", { replace: true });
    }
  }, [location.search, location.hash, navigate]);

  return null;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const welcomeToastFiredRef = useRef<boolean>(false);

  const fetchRoles = async (userId: string) => {
    try {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      setRoles(data?.map((d) => d.role) ?? []);
    } catch {
      setRoles([]);
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Set up listener FIRST for ongoing auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Use setTimeout to avoid deadlocks inside the callback
          setTimeout(() => {
            if (isMounted) fetchRoles(session.user.id);
          }, 0);
        } else {
          setRoles([]);
        }

        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
          setLoading(false);
        }

        if (event === "SIGNED_IN" && !welcomeToastFiredRef.current) {
          welcomeToastFiredRef.current = true;
          if (localStorage.getItem("tfm_pending_welcome") === "1") {
            localStorage.removeItem("tfm_pending_welcome");
            toast.success("Welcome to the FMly ♫");
          }
        }
      }
    );

    // THEN do initial session check
    const initializeAuth = async () => {
      try {
        const prefetched = consumeAuthPrefetch();
        const sessionPromise = prefetched ?? supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 5000)
        );
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
        if (!isMounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchRoles(session.user.id);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = useCallback(() => {
    if (!user) { setProfile(null); return; }
    supabase.from("profiles").select("display_name, avatar_url, bio, spotify_embed_url, spotify_artist_id, wallet_address, invite_code, is_unlimited, is_verified, theme").eq("id", user.id).single()
      .then(({ data }) => {
        if (data) {
          setProfile(data as ProfileData);
          // Apply saved theme
          const savedTheme = (data as any).theme;
          if (savedTheme && (savedTheme === "light" || savedTheme === "dark")) {
            localStorage.setItem("tfm-theme", savedTheme);
            document.documentElement.classList.toggle("dark", savedTheme === "dark");
            document.documentElement.classList.toggle("light", savedTheme === "light");
          }
        }
      });
  }, [user]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  return (
    <AuthContext.Provider value={{ user, session, loading, roles, profile, refreshProfile: fetchProfile }}>
      <AuthUrlCleaner />
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
