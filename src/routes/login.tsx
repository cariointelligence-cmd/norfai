import { createFileRoute, Navigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    error: typeof s.error === "string" ? s.error.slice(0, 80) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in | Norf" },
      { name: "description", content: "Sign in to search companies by revenue, website quality, advertising activity and growth." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Login,
});

function sameOriginPath(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

function Login() {
  const { user, isPending } = useCurrentUserState();
  const { error: authError } = Route.useSearch();
  if (typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app")) {
    window.location.replace(`https://www.norfai.com/login${window.location.search}`);
  }
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);

  if (!isPending && user) {
    return <Navigate to="/overview" />;
  }

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const { error } = await authClient.signUp.email({ email, password, name: email.split("@")[0] ?? "Analyst" });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await authClient.signIn.email({ email, password });
        if (error) throw new Error(error.message);
      }
      window.location.assign(sameOriginPath("/overview"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  function onGoogleOrX(providerId: string) {
    const callbackURL = sameOriginPath("/overview");
    const errorCallbackURL = sameOriginPath("/login");
    void signIn(providerId, { callbackURL, errorCallbackURL }).catch((err) => {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    });
  }

  return (
    <main className="norr-grid flex min-h-dvh items-center bg-canvas px-4 py-12">
      <div className="panel mx-auto w-full max-w-md p-6 sm:p-8">
        <div className="mb-8">
          <a href="/" className="inline-block">
            <img src="/brand/norf-on-dark.png" alt="Norf" className="h-10 w-auto max-w-[160px] object-contain object-left" />
          </a>
          <div className="kicker mt-3">Find companies worth contacting</div>
        </div>
        <p className="mb-6 text-sm text-mute">
          Signed-in workspaces query official registers and company websites. Empty means not found. Nothing is invented.
        </p>
        {authError ? (
          <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {authError === "state_mismatch"
              ? "Sign-in was interrupted (wrong host mid-login). Use https://www.norfai.com/login and try Google again."
              : `Sign-in failed (${authError}). Try again from https://www.norfai.com/login.`}
          </div>
        ) : null}
        {authEnabled ? (
          <div className="space-y-3">
            {GROK_PROVIDERS.map((p) => (
              <Button key={p.providerId} type="button" variant="secondary" className="w-full" onClick={() => onGoogleOrX(p.providerId)}>
                Continue with {p.label}
              </Button>
            ))}
            <div className="flex items-center gap-3 py-2 text-[11px] uppercase tracking-[0.16em] text-faint">
              <span className="h-px flex-1 bg-line" />
              or email
              <span className="h-px flex-1 bg-line" />
            </div>
            <form className="space-y-3" onSubmit={onEmail}>
              <Field label="Email">
                <Input id="email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </Field>
              <Field label="Password">
                <Input id="password" name="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "up" ? "new-password" : "current-password"} minLength={8} />
              </Field>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Working…" : mode === "up" ? "Create workspace" : "Sign in"}
              </Button>
            </form>
            <button type="button" className="tap text-sm text-mute hover:text-ink" onClick={() => setMode(mode === "in" ? "up" : "in")}>
              {mode === "in" ? "Need an account? Create one" : "Already registered? Sign in"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-mute">Sign-in is disabled.</p>
        )}
      </div>
    </main>
  );
}