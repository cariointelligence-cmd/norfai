import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createApiToken, listApiTokens, listMySessions, revokeApiToken, revokeSession } from "@/lib/norr/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Pill } from "@/components/status";
import { useState } from "react";
import { toast } from "sonner";
import { formatWhen, asDisplay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";

export const Route = createFileRoute("/_app/security")({ component: WorkspaceSecurity });

function WorkspaceSecurity() {
  const { locale } = useI18n();
  const copy = loc(
    {
      fi: {
        title: "Turvallisuus",
        body: "Istunnot ja konetunnukset. Selainkirjautuminen ei ole API. Tunnus näytetään kokonaan vain kerran.",
        sessions: "Aktiiviset istunnot",
        noSessions: "Ei istuntoja tällä työtilalla vielä.",
        signOut: "Kirjaudu ulos",
        tokens: "API-tunnukset",
        tokenHint: "Rajattu konerajapinta Norfin viralliseen API:in. Älä liitä selainevästettä skriptiin.",
        tokenName: "Tunnuksen nimi",
        create: "Luo lukutunnus",
        copyNow: "Kopioi nyt",
        noTokens: "Ei tunnuksia.",
        revoked: "peruttu",
        revoke: "Peruuta",
        signedOut: "Istunto suljettu",
        tokenRevoked: "Tunnus peruttu",
        copyOnce: "Kopioi tunnus nyt. Se näytetään vain kerran.",
        hiddenIp: "IP piilotettu",
        session: "Istunto",
      },
      en: {
        title: "Security",
        body: "Sessions and machine tokens. Browser login is not an API. Tokens are hashed at rest and shown in full only once.",
        sessions: "Active sessions",
        noSessions: "No session records on this workspace yet.",
        signOut: "Sign out",
        tokens: "API tokens",
        tokenHint: "Scoped machine access for the official Norf API. Never paste a browser cookie into a script.",
        tokenName: "Token name",
        create: "Create read token",
        copyNow: "Copy now",
        noTokens: "No tokens.",
        revoked: "revoked",
        revoke: "Revoke",
        signedOut: "Session signed out",
        tokenRevoked: "Token revoked",
        copyOnce: "Copy the token now. It is shown once.",
        hiddenIp: "IP hidden",
        session: "Session",
      },
      sv: {
        title: "Säkerhet",
        body: "Sessioner och maskintoken. Webbläsarinloggning är inte ett API. Token visas i sin helhet bara en gång.",
        sessions: "Aktiva sessioner",
        noSessions: "Inga sessioner på den här arbetsytan ännu.",
        signOut: "Logga ut",
        tokens: "API-token",
        tokenHint: "Avgränsad maskinåtkomst till Norfs officiella API. Klistra inte in en webbläsarcookie i ett skript.",
        tokenName: "Tokennamn",
        create: "Skapa lästoken",
        copyNow: "Kopiera nu",
        noTokens: "Inga token.",
        revoked: "återkallad",
        revoke: "Återkalla",
        signedOut: "Session avslutad",
        tokenRevoked: "Token återkallad",
        copyOnce: "Kopiera token nu. Den visas bara en gång.",
        hiddenIp: "IP dold",
        session: "Session",
      },
    },
    locale,
  );
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => listMySessions() });
  const tokens = useQuery({ queryKey: ["api-tokens"], queryFn: () => listApiTokens() });
  const [name, setName] = useState("Workspace API");
  const [revealed, setRevealed] = useState<string | null>(null);
  const mint = useMutation({
    mutationFn: () => createApiToken({ data: { name, scopes: "company:read" } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setRevealed(r.token);
      toast.message(copy.copyOnce);
      void qc.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });
  const killSession = useMutation({
    mutationFn: (sessionId: string) => revokeSession({ data: { sessionId } }),
    onSuccess: () => {
      toast.message(copy.signedOut);
      void qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
  const killToken = useMutation({
    mutationFn: (id: string) => revokeApiToken({ data: { id } }),
    onSuccess: () => {
      toast.message(copy.tokenRevoked);
      void qc.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">{copy.title}</h1>
        <p className="mt-1 text-sm text-mute">{copy.body}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">{copy.sessions}</h2>
        <div className="border border-line">
          {(sessions.data?.sessions ?? []).length === 0 ? (
            <p className="px-3 py-3 text-sm text-mute">{copy.noSessions}</p>
          ) : (sessions.data?.sessions ?? []).map((s: any) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 last:border-0">
              <div>
                <div className="text-sm">{asDisplay(s.userAgent, copy.session)}</div>
                <div className="font-mono text-[11px] text-mute">{asDisplay(s.ip, copy.hiddenIp)} · {formatWhen(s.lastActive ?? s.last_active ?? s.updated, "-", locale)}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => killSession.mutate(s.id)}>{copy.signOut}</Button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">{copy.tokens}</h2>
        <p className="text-xs text-mute">{copy.tokenHint}</p>
        <Field label={copy.tokenName}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button onClick={() => mint.mutate()} disabled={mint.isPending}>{copy.create}</Button>
        {revealed ? (
          <div className="border border-line bg-panel p-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-faint">{copy.copyNow}</div>
            <code className="mt-2 block break-all text-xs">{revealed}</code>
          </div>
        ) : null}
        <div className="border border-line">
          {(tokens.data?.tokens ?? []).length === 0 ? (
            <p className="px-3 py-3 text-sm text-mute">{copy.noTokens}</p>
          ) : (tokens.data?.tokens ?? []).map((t: any) => (
            <div key={t.id} className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 last:border-0">
              <div>
                <div className="text-sm">{asDisplay(t.name)} <span className="font-mono text-xs text-mute">{asDisplay(t.prefix)}…</span></div>
                <div className="text-[11px] text-mute">{asDisplay(t.scopes)}{t.revoked_at ? ` · ${copy.revoked}` : ""}</div>
              </div>
              {t.revoked_at ? <Pill>{copy.revoked}</Pill> : (
                <Button size="sm" variant="danger" onClick={() => killToken.mutate(t.id)}>{copy.revoke}</Button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
