import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { User, Session } from "@supabase/supabase-js";

interface ProfileData {
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  spotify_embed_url: string | null;
  spotify_artist_id: string | null;
  wallet_address: string | null;
  invite_code: string | null;
  is_unlimited: boolean;
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);

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
        console.log("[auth] onAuthStateChange:", event, !!session);
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

        // If this is a SIGNED_IN event (e.g. from email verification), ensure loading is false
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setLoading(false);
          // Clean up auth params from URL after verification and show welcome toast
          if (window.location.search?.includes('code=') || window.location.hash?.includes('access_token')) {
            window.history.replaceState({}, '', '/CrowdFit');
            if (event === 'SIGNED_IN') {
              toast.success("Welcome to the toolsFM fmly ♫");
            }
          }
        }
      }
    );

    // THEN do initial session check
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;
        console.log("[auth] getSession:", !!session);
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
    supabase.from("profiles").select("display_name, avatar_url, bio, spotify_embed_url, spotify_artist_id, wallet_address, invite_code, is_unlimited").eq("id", user.id).single()
      .then(({ data }) => { if (data) setProfile(data as ProfileData); });
  }, [user]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  return (
    <AuthContext.Provider value={{ user, session, loading, roles, profile, refreshProfile: fetchProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
