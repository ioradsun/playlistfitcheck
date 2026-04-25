import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFmlyNumber } from "@/hooks/useFmlyNumber";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Mode = "signup" | "login" | "forgot";
type CreatorRole = "artist" | "beatmaker" | "tastemaker" | null;

const ROLES: { value: NonNullable<CreatorRole>; label: string }[] = [
  { value: "artist", label: "songs" },
  { value: "beatmaker", label: "beats" },
  { value: "tastemaker", label: "taste" },
];

const Auth = () => {
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get("ref") || null;
  const modeParam = searchParams.get("mode");
  const hasVisited = localStorage.getItem("tfm_has_account") === "1";
  const [mode, setMode] = useState<Mode>(
    modeParam === "signin" ? "login" : hasVisited ? "login" : "signup",
  );

  useEffect(() => {
    const m = searchParams.get("mode");
    if (m) setMode(m === "signin" ? "login" : "signup");
  }, [searchParams]);

  const [checkEmail, setCheckEmail] = useState(false);
  const [role, setRole] = useState<CreatorRole>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { nextNumber, spotsRemaining, loading: blazerLoading } = useFmlyNumber();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTab = (location.state as any)?.returnTab;
  const claimSlug = (location.state as any)?.claimSlug ?? null;
  const claimToken = (location.state as any)?.claimToken ?? null;
  const intent = searchParams.get("intent");
  const artistId = searchParams.get("artist");

  useEffect(() => {
    if (user) {
      // If user just signed up with a ref code, convert invite
      if (refCode) {
        supabase.functions
          .invoke("convert-invite", { body: { inviteCode: refCode } })
          .then(({ data }) => {
            if (data?.success) {
              toast.success("Invite accepted! Your inviter unlocked unlimited access.");
            }
          })
          .catch(console.error);
      }
      if (claimSlug && claimToken) {
        (supabase as any)
          .from("ghost_artist_profiles")
          .update({
            is_claimed: true,
            claimed_by_user_id: user.id,
            claimed_at: new Date().toISOString(),
          })
          .eq("spotify_artist_slug", claimSlug)
          .eq("claim_token", claimToken)
          .eq("is_claimed", false)
          .then(() => {
            navigate(`/artist/${claimSlug}/claim-page`, {
              state: { justClaimed: true },
            });
          });
      } else if (intent === "drop_alert" && artistId) {
        supabase
          .from("release_subscriptions")
          .upsert(
            {
              subscriber_user_id: user.id,
              artist_user_id: artistId,
            },
            { onConflict: "subscriber_user_id,artist_user_id", ignoreDuplicates: true },
          )
          .then(({ error }) => {
            if (error) {
              toast.error(error.message);
            }
            navigate(`/u/${artistId}`, { replace: true });
          });
      } else {
        navigate("/", { state: { returnTab } });
      }
    }
  }, [user, navigate, returnTab, refCode, claimSlug, claimToken, intent, artistId]);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Check your email for a password reset link!");
      setMode("login");
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
              display_name: email.split("@")[0],
              creator_role: role,
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
        if (claimSlug && claimToken) {
          const userId = (await supabase.auth.getUser()).data.user?.id;
          await (supabase as any)
            .from("ghost_artist_profiles")
            .update({
              is_claimed: true,
              claimed_by_user_id: userId,
              claimed_at: new Date().toISOString(),
            })
            .eq("spotify_artist_slug", claimSlug)
            .eq("claim_token", claimToken)
            .eq("is_claimed", false);
          navigate(`/artist/${claimSlug}/claim-page`, {
            state: { justClaimed: true },
          });
        } else if (intent === "drop_alert" && artistId) {
          const userId = (await supabase.auth.getUser()).data.user?.id;
          if (userId) {
            await supabase
              .from("release_subscriptions")
              .upsert(
                {
                  subscriber_user_id: userId,
                  artist_user_id: artistId,
                },
                { onConflict: "subscriber_user_id,artist_user_id", ignoreDuplicates: true },
              );
          }
          navigate(`/u/${artistId}`, { replace: true });
        } else {
          navigate("/", { state: { returnTab } });
        }
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm flex flex-col items-center gap-5">
        {claimSlug && !checkEmail && (
          <div className="w-full p-3 rounded-xl bg-primary/10 border border-primary/20 text-center">
            <p className="text-sm font-medium text-foreground">Claiming your artist page</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sign up or sign in to own{" "}
              <span className="font-mono text-primary">tools.fm/artist/{claimSlug}</span>
            </p>
          </div>
        )}

        <div className="glass-card border-border w-full rounded-2xl p-6">
          {checkEmail ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="text-center space-y-5 py-4"
            >
              <div
                className="mx-auto w-14 h-14 rounded-full bg-primary/10
                              flex items-center justify-center"
              >
                <CheckCircle2 className="text-primary" size={28} />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">check your email</h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                  we sent a confirmation link to{" "}
                  <span className="text-foreground font-medium">{email}</span>. tap it to
                  activate your account.
                </p>
              </div>
              <div className="pt-2 space-y-3">
                <p className="text-xs text-muted-foreground">didn't get it? check your spam folder.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-primary"
                  onClick={() => {
                    setCheckEmail(false);
                    setMode("login");
                  }}
                >
                  back to log in
                </Button>
              </div>
            </motion.div>
          ) : (
            <div className="space-y-5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                >
                  {mode === "signup" && (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">you're here for your</p>
                      <div className="flex items-center justify-center gap-3">
                        {ROLES.map((r) => (
                          <button
                            key={r.value}
                            type="button"
                            onClick={() => setRole(r.value)}
                            className={[
                              "rounded-full px-5 py-2 text-sm font-medium",
                              "border transition-all duration-150 cursor-pointer",
                              role === r.value
                                ? "bg-primary text-primary-foreground border-primary"
                                : [
                                    "bg-transparent border-border/50",
                                    "text-muted-foreground",
                                    "hover:border-border hover:text-foreground",
                                  ].join(" "),
                            ].join(" ")}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {mode === "login" && (
                    <h2 className="text-xl font-semibold tracking-tight">Welcome back.</h2>
                  )}

                  {mode === "forgot" && (
                    <div className="space-y-1">
                      <h2 className="text-xl font-semibold tracking-tight">Reset your password.</h2>
                      <p className="text-sm text-muted-foreground">We'll send a link to your email.</p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              <AnimatePresence>
                {(mode !== "signup" || role !== null) && (
                  <motion.div
                    key="form-reveal"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: "hidden" }}
                  >
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (mode === "forgot") {
                          void handleForgotPassword(e);
                        } else {
                          void handleEmailAuth(e, mode === "signup" ? "signup" : "signin");
                        }
                      }}
                      className="space-y-3"
                    >
                      <Input
                        type="email"
                        required
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                      />

                      <AnimatePresence>
                        {mode !== "forgot" && (
                          <motion.div
                            key="password-field"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.15 }}
                            style={{ overflow: "hidden" }}
                          >
                            <Input
                              type="password"
                              required
                              minLength={6}
                              placeholder="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              autoComplete={mode === "signup" ? "new-password" : "current-password"}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={
                          loading || !email.trim() || (mode !== "forgot" && password.length < 6)
                        }
                      >
                        {loading ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : mode === "signup" ? (
                          nextNumber && !blazerLoading ? (
                            `Claim ${String(nextNumber).padStart(4, "0")} FMLY Badge`
                          ) : (
                            "Claim your FMLY Badge"
                          )
                        ) : mode === "login" ? (
                          "Log in"
                        ) : (
                          "Send reset link"
                        )}
                      </Button>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="text-center">
                {mode === "signup" && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Already FMLY?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setMode("login");
                          setRole(null);
                        }}
                        className="text-primary hover:underline"
                      >
                        Log in →
                      </button>
                    </p>
                    {role !== null && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[11px] text-muted-foreground/40 tracking-wide"
                      >
                        {spotsRemaining > 0 ? `${spotsRemaining.toLocaleString()} left · ` : ""}
                        yours for life ·{" "}
                        <Link
                          to="/terms"
                          className="text-primary/50 hover:text-primary/80 underline-offset-2 hover:underline"
                        >
                          terms
                        </Link>
                      </motion.p>
                    )}
                  </div>
                )}

                {mode === "login" && (
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                    <p className="text-xs text-muted-foreground">
                      New here?{" "}
                      <button
                        type="button"
                        onClick={() => setMode("signup")}
                        className="text-primary hover:underline"
                      >
                        Claim your number →
                      </button>
                    </p>
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs text-muted-foreground/60 hover:text-muted-foreground"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {mode === "forgot" && (
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ← Back
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
