import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, ShieldCheck, ArrowRight } from "lucide-react";
import { exchangeGoogleCode } from "@/lib/account.functions";
import { neonAuth } from "@/integrations/neon/auth";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying Google authorization...");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function handleAuth() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          throw new Error(`Google authorization error: ${error}`);
        }

        if (!code) {
          throw new Error("No authorization code received from Google.");
        }

        setMessage("Exchanging authorization code with Google...");
        const redirectUri = `${window.location.origin}/auth/callback`;

        const { user, session } = await exchangeGoogleCode({
          data: { code, redirectUri },
        });

        if (!isMounted) return;

        neonAuth.setSession(session);
        const adminCheck = user.role === "admin";
        setIsAdmin(adminCheck);
        setStatus("success");
        setMessage(`Signed in successfully as ${user.email}`);

        // Notify opener window if in OAuth popup
        if (window.opener) {
          try {
            window.opener.postMessage(
              {
                type: "OAUTH_AUTH_SUCCESS",
                session,
                user,
              },
              "*",
            );
          } catch {}
          setTimeout(() => {
            try {
              window.close();
            } catch {}
          }, 800);
        } else {
          // Direct navigation
          setTimeout(() => {
            navigate({ to: adminCheck ? "/admin" : "/dashboard", replace: true });
          }, 1000);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setStatus("error");
        setMessage(err.message || "Failed to complete Google authentication.");
      }
    }

    handleAuth();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="panel w-full max-w-md p-8 text-center shadow-xl">
        {status === "loading" && (
          <div className="space-y-4">
            <div className="brand-gradient mx-auto flex size-14 items-center justify-center rounded-2xl text-primary-foreground shadow-lg shadow-primary/20">
              <Loader2 className="size-7 animate-spin" />
            </div>
            <h1 className="font-display text-xl font-bold text-foreground">
              Authenticating with Google
            </h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <p className="text-xs text-muted-foreground/80">
              This window will close automatically once completed.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <CheckCircle2 className="size-7" />
            </div>
            <h1 className="font-display text-xl font-bold text-foreground">
              Authentication Complete
            </h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            {isAdmin && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <ShieldCheck className="size-3.5" />
                Administrator privileges active
              </div>
            )}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  if (window.opener) {
                    try {
                      window.close();
                    } catch {}
                  } else {
                    navigate({ to: isAdmin ? "/admin" : "/dashboard", replace: true });
                  }
                }}
                className="brand-gradient inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-95"
              >
                Continue to {isAdmin ? "Admin Portal" : "Dashboard"}
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20">
              <AlertTriangle className="size-7" />
            </div>
            <h1 className="font-display text-xl font-bold text-foreground">
              Authentication Error
            </h1>
            <p className="text-sm text-destructive">{message}</p>
            <div className="pt-2 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => navigate({ to: "/auth", replace: true })}
                className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
              >
                Return to Sign in
              </button>
              {window.opener && (
                <button
                  type="button"
                  onClick={() => window.close()}
                  className="rounded-xl bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Close Window
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
