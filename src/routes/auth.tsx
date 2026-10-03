import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Loader2,
  Lock,
  Mail,
  User,
  Sparkles,
  ShieldCheck,
  Copy,
  Check,
  ExternalLink,
  Info,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { neonAuth } from "@/integrations/neon/auth";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({
    mode: z.enum(["login", "register"]).optional(),
    redirect: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Sign in — NeoSMM" },
      {
        name: "description",
        content: "Sign in to NeoSMM or create an account to order managed social media services.",
      },
      { property: "og:title", content: "Sign in — NeoSMM" },
      { property: "og:description", content: "Access your NeoSMM dashboard." },
    ],
  }),
  component: AuthPage,
});

function safePath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function GoogleIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.94H1.27v3.13C3.25 21.32 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.26c-.25-.72-.38-1.49-.38-2.26s.13-1.54.38-2.26V6.61H1.27C.46 8.23 0 10.06 0 12s.46 3.77 1.27 5.39l4.01-3.13z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.68 1.27 6.61l4.01 3.13c.95-2.84 3.6-4.99 6.72-4.99z"
      />
    </svg>
  );
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"login" | "register">(search.mode ?? "login");
  const [form, setForm] = useState({ email: "", password: "", fullName: "" });
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const target = safePath(search.redirect);

  useEffect(() => {
    if (!loading && user) {
      if (user.role === "admin" && target === "/dashboard") {
        navigate({ to: "/admin", replace: true });
      } else {
        navigate({ to: target, replace: true });
      }
    }
  }, [loading, user, navigate, target]);

  // Listen for OAuth message from Google popup and storage events
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      // Allow current origin, localhost, 127.0.0.1, or Cloud Run runtime origins
      const origin = event.origin;
      const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
      const isAllowed =
        !origin ||
        origin === currentOrigin ||
        origin.includes("localhost") ||
        origin.includes("127.0.0.1") ||
        origin.endsWith(".run.app") ||
        origin.endsWith(".ai.studio") ||
        origin.endsWith(".site");

      if (!isAllowed) {
        return;
      }

      if (event.data?.type === "OAUTH_AUTH_SUCCESS" && event.data?.session) {
        neonAuth.setSession(event.data.session);
        const signedUser = event.data.user || event.data.session.user;
        toast.success(`Signed in as ${signedUser.email}`);
        if (signedUser.role === "admin") {
          navigate({ to: "/admin", replace: true });
        } else {
          navigate({ to: target, replace: true });
        }
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "neosmm_neon_auth_session" && event.newValue) {
        try {
          const session = JSON.parse(event.newValue);
          if (session?.user) {
            neonAuth.setSession(session);
            toast.success(`Signed in as ${session.user.email}`);
            if (session.user.role === "admin") {
              navigate({ to: "/admin", replace: true });
            } else {
              navigate({ to: target, replace: true });
            }
          }
        } catch {}
      }
    };

    window.addEventListener("message", handleOAuthMessage);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("message", handleOAuthMessage);
      window.removeEventListener("storage", handleStorage);
    };
  }, [navigate, target]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "register") {
        const { error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            emailRedirectTo: `${window.location.origin}${target}`,
            data: { full_name: form.fullName },
          },
        });
        if (error) throw error;
        toast.success("Welcome to NeoSMM. Your account is ready!");
        navigate({ to: target, replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (error) throw error;
        toast.success("Signed in.");
        navigate({ to: target, replace: true });
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleGoogleLogin() {
    const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
    if (clientId && clientId.length > 5) {
      const redirectUri = `${window.location.origin}/auth/callback`;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        access_type: "offline",
        prompt: "select_account",
      });
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      const authWindow = window.open(
        authUrl,
        "google_oauth_popup",
        "width=560,height=680,menubar=no,toolbar=no",
      );

      if (!authWindow) {
        toast.error("Please allow popups to continue with Google Sign-in.");
      } else {
        toast.info("Connecting to Google...");
      }
    } else {
      setShowOAuthModal(true);
    }
  }

  async function handleInstantGoogle(email: string, fullName?: string) {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: "password123",
      });
      if (error) throw error;
      setShowOAuthModal(false);
      toast.success(`Signed in as ${email} (Admin)`);
      navigate({ to: "/admin", replace: true });
    } catch (err: any) {
      toast.error(err.message || "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDemoLogin(account: "neomart" | "voidlureee" | "admin" | "customer") {
    setBusy(true);
    try {
      let email = "admin@neosmm.site";
      if (account === "neomart") email = "neomart981@gmail.com";
      else if (account === "voidlureee") email = "voidlureee@gmail.com";
      else if (account === "customer") email = "customer@neosmm.site";

      await supabase.auth.signInWithPassword({
        email,
        password: "password123",
      });

      const isAdmin = account !== "customer";
      toast.success(`Signed in as ${email} (${isAdmin ? "Admin" : "Customer"})`);
      navigate({ to: isAdmin ? "/admin" : target, replace: true });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedUrl(key);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedUrl(null), 2000);
  }

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const devCallback = `${currentOrigin}/auth/callback`;
  const prodCallback =
    "https://ais-pre-i7ppkzqf3sna22y2yw4p2b-281630943377.asia-southeast1.run.app/auth/callback";

  const field =
    "w-full rounded-xl border border-input bg-card py-2.5 pr-4 pl-10 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40";

  return (
    <div className="aurora flex min-h-screen flex-col bg-background">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 sm:px-6">
        <Logo />
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="panel w-full max-w-md p-8">
          {checkEmail ? (
            <div className="space-y-4 text-center">
              <span className="brand-gradient mx-auto flex size-12 items-center justify-center rounded-2xl text-primary-foreground">
                <Mail className="size-6" />
              </span>
              <h1 className="font-display text-2xl font-bold">Confirm your email</h1>
              <p className="text-sm text-muted-foreground">
                We sent a confirmation link to <strong>{form.email}</strong>. Click it to activate
                your NeoSMM account, then sign in.
              </p>
              <button
                type="button"
                onClick={() => {
                  setCheckEmail(false);
                  setMode("login");
                }}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "login"
                  ? "Sign in to manage your orders, wallet and reports."
                  : "Start ordering managed social media work in minutes."}
              </p>

              {/* Primary Google Login Button */}
              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition-all hover:bg-muted hover:border-border/80 shadow-sm"
                >
                  <GoogleIcon className="size-5" />
                  <span>Continue with Google</span>
                </button>
              </div>

              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> or with email{" "}
                <span className="h-px flex-1 bg-border" />
              </div>

              <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                {(["login", "register"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      mode === m
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "login" ? "Sign in" : "Register"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "register" && (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-foreground">
                      Full name
                    </label>
                    <div className="relative">
                      <User className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        required
                        value={form.fullName}
                        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                        placeholder="Alex Rivers"
                        className={field}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="you@domain.com"
                      className={field}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="••••••••"
                      className={field}
                    />
                  </div>
                </div>

                {mode === "login" && (
                  <div className="text-right">
                    <Link
                      to="/forgot-password"
                      className="text-xs text-muted-foreground hover:text-primary"
                    >
                      Forgot password?
                    </Link>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="brand-gradient inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  {mode === "login" ? "Sign in" : "Create account"}
                </button>
              </form>

              {/* Authorized Admin Quick Sign-In */}
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> 1-click admin testing{" "}
                <span className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleDemoLogin("neomart")}
                  disabled={busy}
                  className="flex w-full items-center justify-between rounded-xl border border-primary/40 bg-primary/10 px-3.5 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-primary" />
                    <span>neomart981@gmail.com</span>
                  </span>
                  <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    Main Admin
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDemoLogin("voidlureee")}
                  disabled={busy}
                  className="flex w-full items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs font-semibold text-amber-500 transition-colors hover:bg-amber-500/20"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-amber-500" />
                    <span>voidlureee@gmail.com</span>
                  </span>
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    Temp Admin
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleDemoLogin("admin")}
                    disabled={busy}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Sparkles className="size-3.5" />
                    admin@neosmm.site
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDemoLogin("customer")}
                    disabled={busy}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <User className="size-3.5" />
                    Demo Customer
                  </button>
                </div>
              </div>

              <p className="mt-6 text-center text-xs text-muted-foreground">
                By continuing you agree to our{" "}
                <Link to="/terms" className="text-primary hover:underline">
                  Terms
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </>
          )}
        </div>
      </div>

      {/* Google OAuth Setup & Instant Login Modal */}
      {showOAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="panel max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-card border border-border">
                  <GoogleIcon className="size-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-foreground">
                    Google Sign-In Integration
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Redirect URIs & Instant Admin Testing
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOAuthModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            {/* Instant Google Login for Requested Admins */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-primary">
                <ShieldCheck className="size-4" />
                <span>Instant Sign-In with Authorized Admin Gmails</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Both accounts are configured with full <strong>Admin privileges</strong> in your Neon
                PostgreSQL database.
              </p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleInstantGoogle("neomart981@gmail.com", "NeoMart Owner")}
                  className="flex w-full items-center justify-between rounded-lg bg-card border border-border hover:border-primary/50 px-3 py-2.5 text-xs font-medium text-foreground transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <GoogleIcon className="size-4" />
                    <strong>neomart981@gmail.com</strong>
                  </span>
                  <span className="text-[10px] bg-primary/20 text-primary font-bold px-2 py-0.5 rounded">
                    Main Admin
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleInstantGoogle("voidlureee@gmail.com", "Voidlureee Admin")}
                  className="flex w-full items-center justify-between rounded-lg bg-card border border-border hover:border-amber-500/50 px-3 py-2.5 text-xs font-medium text-foreground transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <GoogleIcon className="size-4" />
                    <strong>voidlureee@gmail.com</strong>
                  </span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-500 font-bold px-2 py-0.5 rounded">
                    Temp Admin
                  </span>
                </button>
              </div>
            </div>

            {/* Google Cloud Console Redirect URI Details */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <Info className="size-4 text-muted-foreground" />
                <span>Google Cloud Console — Authorized Redirect URIs</span>
              </div>
              <p className="text-xs text-muted-foreground">
                In{" "}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Google Cloud Console &rarr; Credentials <ExternalLink className="size-3" />
                </a>
                , add these redirect URIs:
              </p>

              <div className="space-y-2">
                <div className="rounded-lg bg-muted p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                    <span>Development Redirect URI</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(devCallback, "dev")}
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      {copiedUrl === "dev" ? <Check className="size-3" /> : <Copy className="size-3" />}
                      {copiedUrl === "dev" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <code className="block select-all text-xs font-mono text-foreground break-all">
                    {devCallback}
                  </code>
                </div>

                <div className="rounded-lg bg-muted p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                    <span>Shared/Production Redirect URI</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(prodCallback, "prod")}
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      {copiedUrl === "prod" ? (
                        <Check className="size-3" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                      {copiedUrl === "prod" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <code className="block select-all text-xs font-mono text-foreground break-all">
                    {prodCallback}
                  </code>
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground space-y-1">
              <span className="font-semibold text-foreground">Next Step:</span> Add your{" "}
              <code className="text-foreground">GOOGLE_CLIENT_ID</code> and{" "}
              <code className="text-foreground">GOOGLE_CLIENT_SECRET</code> to your{" "}
              <code className="text-foreground">.env</code> file.
            </div>

            <button
              type="button"
              onClick={() => setShowOAuthModal(false)}
              className="w-full rounded-xl bg-card border border-border py-2.5 text-xs font-semibold text-foreground hover:bg-muted"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
