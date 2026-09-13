import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Pill, Stat } from "@/components/status";
import {
  adminFlushMail,
  adminMailOverview,
  adminRetryMail,
  adminSaveMailSettings,
  adminSendTestMail,
} from "@/lib/norr/mail-actions";
import { SITE_EMAIL, SITE_MAIL_FROM, SITE_NAME } from "@/lib/seo/site";
import { formatWhen } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/mail")({ component: AdminMail });

function tone(status: string): "good" | "warn" | "bad" | "mute" | "info" {
  if (status === "sent") return "good";
  if (status === "queued") return "info";
  if (status === "failed") return "bad";
  return "mute";
}

function AdminMail() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [campaign, setCampaign] = useState("");
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState(SITE_EMAIL);
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [mailFrom, setMailFrom] = useState(SITE_MAIL_FROM);
  const [resendKey, setResendKey] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const q = useQuery({
    queryKey: ["admin-mail", status, campaign],
    queryFn: () => adminMailOverview({ data: { status, campaign } }),
  });
  useEffect(() => {
    if (!q.data || !q.data.ok || hydrated) return;
    const s = q.data.settings;
    setSmtpHost(s.smtpHost || "smtp.gmail.com");
    setSmtpPort(s.smtpPort || "587");
    setSmtpUser(s.smtpUser || SITE_EMAIL);
    setSmtpSecure(s.smtpSecure);
    setMailFrom(s.mailFrom || SITE_MAIL_FROM);
    setHydrated(true);
  }, [q.data, hydrated]);
  const flush = useMutation({
    mutationFn: () => adminFlushMail(),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.message(`Sent ${r.sent}, queued ${r.queued}`);
      void qc.invalidateQueries({ queryKey: ["admin-mail"] });
    },
  });
  const retry = useMutation({
    mutationFn: (id: string) => adminRetryMail({ data: { id } }),
    onSuccess: (r) => {
      if (!r.ok) toast.error(r.error);
      else toast.message("Retried");
      void qc.invalidateQueries({ queryKey: ["admin-mail"] });
    },
  });
  const save = useMutation({
    mutationFn: () =>
      adminSaveMailSettings({
        data: { smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, resendApiKey: resendKey, mailFrom },
      }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setSmtpPass("");
      setResendKey("");
      toast.message(r.mailer.configured ? "Mail settings saved. Queue is sending." : "Saved. Add a Resend API key to send.");
      void qc.invalidateQueries({ queryKey: ["admin-mail"] });
      if (r.mailer.configured) test.mutate();
    },
  });
  const test = useMutation({
    mutationFn: () => adminSendTestMail({ data: {} }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const n = r.delivered;
      if (n > 0) toast.message(`Test sent to ${n} admin inbox${n === 1 ? "" : "es"}`);
      else toast.error(r.results[0]?.error || r.hint || "Mail did not leave the server");
      void qc.invalidateQueries({ queryKey: ["admin-mail"] });
    },
  });
  const d = q.data && q.data.ok ? q.data : null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Mail</h1>
          <p className="mt-1 max-w-2xl text-sm text-mute">
            Welcome, quota, winback and ticket mail go through Resend as @norfai.com. Test send goes to every admin inbox immediately.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={flush.isPending} onClick={() => flush.mutate()}>
            Run queue now
          </Button>
          <Button size="sm" disabled={test.isPending} onClick={() => test.mutate()}>
            {test.isPending ? "Sending…" : "Send test to admins"}
          </Button>
        </div>
      </div>
      {d ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Provider" value={d.mailer.provider} hint={d.mailer.hint} />
          <Stat label="From" value={d.mailer.from} hint={d.origin} />
          <Stat label="Queued" value={d.counts.queued ?? 0} />
          <Stat label="Sent" value={d.counts.sent ?? 0} />
        </div>
      ) : null}
      {test.data && test.data.ok ? (
        <div className="border border-line bg-panel p-4">
          <h2 className="text-sm font-medium">Last test</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {test.data.results.map((row) => (
              <li key={row.email} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs">{row.email}</span>
                <Pill tone={row.ok ? "good" : "bad"}>{row.ok ? "sent" : row.error || "failed"}</Pill>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <section className="border border-line bg-panel p-4 md:p-5">
        <h2 className="text-sm font-medium">Outbound</h2>
        <p className="mt-1 max-w-2xl text-xs text-mute">
          Resend is the product path: API key plus From on the verified norfai.com domain.
          Gmail SMTP is a fallback only. Gmail addresses are never used as Resend From.
        </p>
        {d?.settings.envLocked ? (
          <p className="mt-3 text-sm text-mute">Locked by server environment. The form is stored but env wins.</p>
        ) : null}
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="SMTP host">
            <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
          </Field>
          <Field label="Port">
            <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="SMTP user">
            <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} autoComplete="off" />
          </Field>
          <Field label={d?.settings.smtpPassSet ? "App password (saved, leave blank to keep)" : "Gmail app password"}>
            <Input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="From (must be @norfai.com for Resend)">
            <Input value={mailFrom} onChange={(e) => setMailFrom(e.target.value)} placeholder={SITE_MAIL_FROM} />
          </Field>
          <Field label="Resend API key">
            <Input type="password" value={resendKey} onChange={(e) => setResendKey(e.target.value)} autoComplete="off" placeholder={d?.settings.resendSet ? "Saved" : "re_…"} />
          </Field>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
            SMTPS (port 465). Leave off for Gmail 587 + STARTTLS.
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setSmtpHost("");
                setSmtpPort("587");
                setSmtpUser("");
                setSmtpSecure(false);
                setMailFrom(SITE_MAIL_FROM);
              }}
            >
              Resend preset
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setSmtpHost("smtp.gmail.com");
                setSmtpPort("587");
                setSmtpUser(SITE_EMAIL);
                setSmtpSecure(false);
                setMailFrom(`${SITE_NAME} <${SITE_EMAIL}>`);
              }}
            >
              Gmail preset
            </Button>
            <Button type="submit" size="sm" disabled={save.isPending}>Save settings</Button>
          </div>
        </form>
      </section>
      <div className="flex flex-wrap gap-3">
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="queued">Queued</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="skipped">Skipped</option>
          </Select>
        </Field>
        <Field label="Campaign">
          <Select value={campaign} onChange={(e) => setCampaign(e.target.value)}>
            <option value="">All</option>
            {(d?.campaigns ?? []).map((c) => (
              <option key={c.campaign} value={c.campaign}>{c.label} ({c.n})</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="overflow-x-auto border border-line">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="bg-panel text-[11px] uppercase tracking-[0.12em] text-faint">
            <tr>
              {["When", "Campaign", "To", "Subject", "Status", ""].map((h) => (
                <th key={h} className="border-b border-line px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(d?.rows ?? []).length === 0 ? (
              <tr><td className="px-3 py-4 text-mute" colSpan={6}>No mail yet.</td></tr>
            ) : (d?.rows ?? []).map((row) => (
              <tr key={row.id} className="border-b border-line align-top">
                <td className="px-3 py-2 font-mono text-[11px] text-mute">{formatWhen(row.sentAt || row.scheduledAt)}</td>
                <td className="px-3 py-2">{row.campaignLabel}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.email}</td>
                <td className="px-3 py-2">{row.subject}</td>
                <td className="px-3 py-2">
                  <Pill tone={tone(row.status)}>{row.status}</Pill>
                  {row.error ? <div className="mt-1 text-[11px] text-mute">{row.error}</div> : null}
                </td>
                <td className="px-3 py-2">
                  {row.status === "failed" ? (
                    <Button size="sm" variant="secondary" disabled={retry.isPending} onClick={() => retry.mutate(row.id)}>Retry</Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
