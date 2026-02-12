import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface ProfileData {
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  spotify_embed_url: string | null;
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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = useCallback(() => {
    if (!user) { setProfile(null); setRoles([]); return; }
    supabase.from("profiles").select("display_name, avatar_url, bio, spotify_embed_url").eq("id", user.id).single()
      .then(({ data }) => { if (data) setProfile(data as ProfileData); });
    supabase.from("user_roles").select("role").eq("user_id", user.id)
      .then(({ data }) => { setRoles(data?.map((r: any) => r.role) ?? []); });
  }, [user]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  return (
    <AuthContext.Provider value={{ user, session, loading, roles, profile, refreshProfile: fetchProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
