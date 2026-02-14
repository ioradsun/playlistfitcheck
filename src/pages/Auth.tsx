import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Music, Mail, Loader2, X } from "lucide-react";

interface SpotifyArtistResult {
  id: string;
  name: string;
  image: string | null;
  url: string;
  genres?: string[];
}

const Auth = () => {
  const [searchParams] = useSearchParams();
  const [isSignup, setIsSignup] = useState(searchParams.get("mode") === "signup");
  const [isForgot, setIsForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const [artistQuery, setArtistQuery] = useState("");
  const [artistResults, setArtistResults] = useState<SpotifyArtistResult[]>([]);
  const [artistSearching, setArtistSearching] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<SpotifyArtistResult | null>(null);
  const [artistFocused, setArtistFocused] = useState(false);
  const artistDebounce = useRef<ReturnType<typeof setTimeout>>();
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTab = (location.state as any)?.returnTab;

  useEffect(() => {
    if (user) navigate("/", { state: { returnTab } });
  }, [user, navigate, returnTab]);

  // Spotify artist search
  useEffect(() => {
    if (selectedArtist) return;
    if (!artistQuery.trim() || artistQuery.includes("spotify.com")) {
      setArtistResults([]);
      return;
    }
    clearTimeout(artistDebounce.current);
    artistDebounce.current = setTimeout(async () => {
      setArtistSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke("spotify-search", {
          body: { query: artistQuery.trim(), type: "artist" },
        });
        if (!error && data?.results) {
          setArtistResults(data.results.slice(0, 5));
        }
      } catch {}
      setArtistSearching(false);
    }, 350);
    return () => clearTimeout(artistDebounce.current);
  }, [artistQuery, selectedArtist]);

  const handlePasteArtistUrl = useCallback(async () => {
    if (!artistQuery.includes("spotify.com/artist/")) return;
    const match = artistQuery.match(/artist\/([a-zA-Z0-9]+)/);
    if (!match) return;
    setArtistSearching(true);
    setArtistQuery("");
    try {
      // Fetch artist info via search edge function using the artist ID
      const { data, error } = await supabase.functions.invoke("spotify-search", {
        body: { query: match[1], type: "artist" },
      });
      if (!error && data?.results?.length > 0) {
        const a = data.results[0];
        setSelectedArtist({ id: a.id, name: a.name, image: a.image, url: a.url, genres: a.genres });
      } else {
        // Fallback: use the raw ID
        setSelectedArtist({ id: match[1], name: match[1], image: null, url: artistQuery.trim() });
      }
    } catch {
      setSelectedArtist({ id: match[1], name: match[1], image: null, url: artistQuery.trim() });
    } finally {
      setArtistSearching(false);
    }
  }, [artistQuery]);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Check your email for a password reset link!");
      setIsForgot(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              display_name: selectedArtist?.name || email,
              avatar_url: selectedArtist?.image ?? null,
              spotify_artist_id: selectedArtist?.id ?? null,
              spotify_artist_url: selectedArtist?.url ?? null,
              bio: selectedArtist?.genres?.length ? selectedArtist.genres.join(", ") : null,
            },
          },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/", { state: { returnTab } });
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const showArtistDropdown = artistFocused && artistResults.length > 0 && !selectedArtist;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 pt-20">
      <Card className="w-full max-w-md glass-card border-border">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Music className="text-primary" size={24} />
          </div>
          <CardTitle className="text-xl">{isForgot ? "Reset password" : isSignup ? "Create your account" : "Welcome back"}</CardTitle>
          <CardDescription>
            {isForgot ? "Enter your email and we'll send a reset link" : isSignup ? "Sign up to get started" : "Sign in to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isForgot ? (
            <>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending…" : "Send reset link"}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground">
                <button onClick={() => setIsForgot(false)} className="text-primary hover:underline">Back to sign in</button>
              </p>
            </>
          ) : (
            <>
              <form onSubmit={handleEmailAuth} className="space-y-4">
                {isSignup && (
                  <>
                    <div className="space-y-2">
                      <Label>Spotify Artist Profile</Label>
                      <p className="text-xs text-muted-foreground">Search or paste your Spotify artist URL</p>
                      {selectedArtist ? (
                        <div className="flex items-center gap-2.5 p-2 rounded-xl bg-muted/60 border border-border/50">
                          {selectedArtist.image ? (
                            <img src={selectedArtist.image} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                              <Music size={14} className="text-muted-foreground" />
                            </div>
                          )}
                          <span className="text-sm font-medium truncate flex-1">{selectedArtist.name}</span>
                          <button type="button" onClick={() => setSelectedArtist(null)} className="p-1 rounded-full hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-colors">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <Input
                            placeholder="Search artist or paste link…"
                            value={artistQuery}
                            onChange={e => { setArtistQuery(e.target.value); setSelectedArtist(null); }}
                            onKeyDown={e => { if (e.key === "Enter" && artistQuery.includes("spotify.com/artist/")) { e.preventDefault(); handlePasteArtistUrl(); } }}
                            onFocus={() => setArtistFocused(true)}
                            onBlur={() => setTimeout(() => setArtistFocused(false), 200)}
                          />
                          {artistSearching && (
                            <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                          )}
                          {showArtistDropdown && (
                            <div className="absolute left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                              {artistResults.map(a => (
                                <button
                                  key={a.id}
                                  type="button"
                                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40 transition-colors text-left"
                                  onMouseDown={() => { setSelectedArtist(a); setArtistQuery(""); setArtistResults([]); }}
                                >
                                  {a.image ? (
                                    <img src={a.image} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                                  ) : (
                                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                                      <Music size={14} className="text-muted-foreground" />
                                    </div>
                                  )}
                                  <span className="text-sm font-medium truncate">{a.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" required minLength={6} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  <Mail size={16} />
                  {loading ? "Loading…" : isSignup ? "Sign up" : "Sign in"}
                </Button>
              </form>

              {!isSignup && (
                <p className="text-center">
                  <button onClick={() => setIsForgot(true)} className="text-xs text-muted-foreground hover:text-primary hover:underline">
                    Forgot password?
                  </button>
                </p>
              )}

              <p className="text-center text-sm text-muted-foreground">
                {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
                <button onClick={() => setIsSignup(!isSignup)} className="text-primary hover:underline">
                  {isSignup ? "Sign in" : "Sign up free"}
                </button>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
