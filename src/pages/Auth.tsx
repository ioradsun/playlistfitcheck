import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Music, Mail, Loader2, X, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

interface SpotifyArtistResult {
  id: string;
  name: string;
  image: string | null;
  url: string;
  genres?: string[];
}

const Auth = () => {
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get("ref") || null;
  const modeParam = searchParams.get("mode");
  const hasVisited = localStorage.getItem("tfm_has_account") === "1";
  const initialTab = modeParam ? (modeParam === "signin" ? "signin" : "signup") : (hasVisited ? "signin" : "signup");
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    const m = searchParams.get("mode");
    if (m) setActiveTab(m === "signin" ? "signin" : "signup");
  }, [searchParams]);

  const [checkEmail, setCheckEmail] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [artistQuery, setArtistQuery] = useState("");
  const [artistResults, setArtistResults] = useState<SpotifyArtistResult[]>([]);
  const [artistSearching, setArtistSearching] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<SpotifyArtistResult | null>(null);
  const [artistFocused, setArtistFocused] = useState(false);
  const artistDebounce = useRef<ReturnType<typeof setTimeout>>();
  const emailRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTab = (location.state as any)?.returnTab;

  useEffect(() => {
    if (user) {
      // If user just signed up with a ref code, convert invite
      if (refCode) {
        supabase.functions.invoke("convert-invite", { body: { inviteCode: refCode } })
          .then(({ data }) => {
            if (data?.success) {
              toast.success("Invite accepted! Your inviter unlocked unlimited access.");
            }
          })
          .catch(console.error);
      }
      navigate("/", { state: { returnTab } });
    }
  }, [user, navigate, returnTab, refCode]);

  // Auto-focus email after artist is selected
  useEffect(() => {
    if (selectedArtist && activeTab === "signup") {
      setTimeout(() => emailRef.current?.focus(), 100);
    }
  }, [selectedArtist, activeTab]);

  const handlePasteArtistUrl = useCallback(async () => {
    if (!artistQuery.includes("spotify.com/artist/")) return;
    const match = artistQuery.match(/artist\/([a-zA-Z0-9]+)/);
    if (!match) return;
    setArtistSearching(true);
    setArtistQuery("");
    try {
      const { data, error } = await supabase.functions.invoke("spotify-search", {
        body: { query: match[1], type: "artist" },
      });
      if (!error && data?.results?.length > 0) {
        const a = data.results[0];
        setSelectedArtist({ id: a.id, name: a.name, image: a.image, url: a.url, genres: a.genres });
      } else {
        setSelectedArtist({ id: match[1], name: match[1], image: null, url: artistQuery.trim() });
      }
    } catch {
      setSelectedArtist({ id: match[1], name: match[1], image: null, url: artistQuery.trim() });
    } finally {
      setArtistSearching(false);
    }
  }, [artistQuery]);

  // Auto-fetch pasted Spotify artist URL
  useEffect(() => {
    if (selectedArtist) return;
    if (artistQuery.includes("spotify.com/artist/")) {
      handlePasteArtistUrl();
    }
  }, [artistQuery, selectedArtist, handlePasteArtistUrl]);

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

  const handleEmailAuth = async (e: React.FormEvent, mode: "signup" | "signin") => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
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
        localStorage.setItem("tfm_has_account", "1");
        setCheckEmail(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        localStorage.setItem("tfm_has_account", "1");
        navigate("/", { state: { returnTab } });
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const showArtistDropdown = artistFocused && artistResults.length > 0 && !selectedArtist;

  const emailPasswordFields = (
    <>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" ref={emailRef} type="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" required minLength={6} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
      </div>
    </>
  );

  const artistField = (
    <div className="space-y-2">
      <Label>Spotify Artist Profile</Label>
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
            placeholder="Search or paste your Spotify artist URL"
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
  );

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md glass-card border-border">
        {!checkEmail && (
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Music className="text-primary" size={24} />
            </div>
          </CardHeader>
        )}
        <CardContent className="space-y-4">
          {checkEmail ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="text-center space-y-5 py-4"
            >
              <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="text-primary" size={28} />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">check your email</h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                  we sent a confirmation link to <span className="text-foreground font-medium">{email}</span>. tap it to activate your account.
                </p>
              </div>
              <div className="pt-2 space-y-3">
                <p className="text-xs text-muted-foreground">didn't get it? check your spam folder.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-primary"
                  onClick={() => { setCheckEmail(false); setActiveTab("signin"); }}
                >
                  back to log in
                </Button>
              </div>
            </motion.div>
          ) : isForgot ? (
            <>
              <h3 className="text-lg font-semibold text-center">Reset password</h3>
              <p className="text-sm text-muted-foreground text-center">Enter your email and we'll send a reset link</p>
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
                <button onClick={() => setIsForgot(false)} className="text-primary hover:underline">Back to log in</button>
              </p>
            </>
          ) : (
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v)} className="w-full">
              <TabsList className="w-full flex gap-6 border-b border-border/30 pb-2 mb-1">
                <TabsTrigger value="signup" className="flex-1">Sign Up</TabsTrigger>
                <TabsTrigger value="signin" className="flex-1">Log In</TabsTrigger>
              </TabsList>

              <TabsContent value="signup">
                <form onSubmit={e => handleEmailAuth(e, "signup")} className="space-y-4 mt-4">
                  {artistField}
                  {emailPasswordFields}
                  <Button type="submit" className="w-full" disabled={loading || !email.trim() || password.length < 6}>
                    {loading ? "Loading…" : "Sign Up for Free"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    By signing up, you are agreeing to{" "}
                    <Link to="/terms" className="text-primary hover:underline">this</Link>.
                  </p>
                </form>
              </TabsContent>

              <TabsContent value="signin">
                <form onSubmit={e => handleEmailAuth(e, "signin")} className="space-y-4 mt-4">
                  {emailPasswordFields}
                  <div className="flex items-center gap-2">
                    <Checkbox id="remember" checked={rememberMe} onCheckedChange={(v) => setRememberMe(v === true)} />
                    <Label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer select-none">Remember Me</Label>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading || !email.trim() || password.length < 6}>
                    {loading ? "Loading…" : "Log In"}
                  </Button>
                </form>
                <p className="text-center mt-3">
                  <button onClick={() => setIsForgot(true)} className="text-xs text-muted-foreground hover:text-primary hover:underline">
                    Forgot password?
                  </button>
                </p>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
