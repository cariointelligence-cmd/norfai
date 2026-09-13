import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  disconnectGsc,
  getSeoDashboard,
  refreshGsc,
  runSeoSnapshot,
  saveGscClient,
  saveGscServiceAccount,
  selectGscProperty,
  startGscConnect,
} from "@/lib/seo/actions.ts";
import { privateHead } from "@/lib/seo/head.ts";
import { seoIssueNotice } from "@/lib/seo/audit.ts";
import type { GscMetricRow, GscPublicView, GscSnapshot } from "@/lib/seo/gsc-types.ts";
import { formatStamp, formatWhen } from "@/lib/format.ts";
import { Pill } from "@/components/status";

export const Route = createFileRoute("/admin/seo")({
  head: () => privateHead("SEO and GEO"),
  component: AdminSeo,
});

function AdminSeo() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-seo"], queryFn: () => getSeoDashboard() });
  const snap = useMutation({
    mutationFn: () => runSeoSnapshot(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-seo"] }),
  });
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const data = ev.data as { type?: string; ok?: boolean };
      if (data?.type !== "norf-gsc") return;
      void qc.invalidateQueries({ queryKey: ["admin-seo"] });
      toast.message(data.ok ? "Search Console connected" : "Search Console connection did not finish");
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [qc]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gsc = params.get("gsc");
    if (gsc === "connected") {
      void qc.invalidateQueries({ queryKey: ["admin-seo"] });
      toast.message("Search Console connected");
    }
  }, [qc]);
  const d = q.data;
  if (q.isPending) {
    return <p className="text-sm text-mute">Loading…</p>;
  }
  if (!d || !d.ok) {
    return <p className="text-sm text-mute">{d && "error" in d ? d.error : "Could not load SEO dashboard."}</p>;
  }
  const a = d.audit;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">SEO and GEO</h1>
          <p className="mt-1 text-sm text-mute">
            Health is computed from public pages. Rankings are shown only when Search Console is connected.
          </p>
        </div>
        <Button variant="secondary" onClick={() => snap.mutate()} disabled={snap.isPending}>
          {snap.isPending ? "Saving snapshot" : "Save snapshot"}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="SEO health" value={a.health} />
        <Stat label="GEO readiness" value={a.geo} />
        <Stat label="Threats" value={a.notices?.threat ?? a.issues.filter((i) => seoIssueNotice(i) === "threat").length} />
        <Stat label="Warnings" value={a.notices?.warning ?? a.issues.filter((i) => seoIssueNotice(i) === "warning").length} />
        <Stat label="Missing" value={a.notices?.missing ?? a.issues.filter((i) => seoIssueNotice(i) === "missing").length} />
        <Stat label="Indexable pages" value={d.pages} />
      </div>
      <SearchConsolePanel view={d.searchConsole} onChange={() => void qc.invalidateQueries({ queryKey: ["admin-seo"] })} />
      <section>
        <h2 className="text-sm font-medium">Issues</h2>
        <div className="mt-3 border border-line">
          {a.issues.length === 0 ? <p className="px-3 py-4 text-sm text-mute">No catalog issues.</p> : null}
          {a.issues.map((issue) => (
            <article key={`${issue.path}-${issue.code}`} className="border-b border-line px-3 py-3 last:border-0">
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.12em] text-faint">
                <Pill tone={seoIssueNotice(issue) === "threat" ? "bad" : seoIssueNotice(issue) === "warning" ? "warn" : "mute"}>{seoIssueNotice(issue)}</Pill>
                <span>{issue.path}</span>
                <span>{issue.code}</span>
              </div>
              <p className="mt-1 text-sm">{issue.what}</p>
              <p className="mt-1 text-xs text-mute">Why: {issue.why}</p>
              <p className="mt-1 text-xs text-mute">Action: {issue.action}</p>
            </article>
          ))}
        </div>
      </section>
      <section>
        <h2 className="text-sm font-medium">Change log</h2>
        <div className="mt-3 border border-line">
          {d.log.length === 0 ? <p className="px-3 py-4 text-sm text-mute">No automatic edits logged. Content is not rewritten on a timer.</p> : null}
          {d.log.map((row) => (
            <div key={row.id} className="border-b border-line px-3 py-2 text-sm last:border-0">
              <div>{row.path} · {row.action}</div>
              <div className="text-xs text-mute">{row.reason} · {formatStamp(row.created_at)}</div>
            </div>
          ))}
        </div>
      </section>
      <p className="text-xs text-faint">Published posts {d.newsCount}. Drafts {d.draftCount}. Weak drafts stay unpublished.</p>
    </div>
  );
}

function SearchConsolePanel({ view, onChange }: { view: GscPublicView; onChange: () => void }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saJson, setSaJson] = useState("");
  const [siteUrl, setSiteUrl] = useState(view.siteUrl ?? "");
  const [showSa, setShowSa] = useState(false);

  useEffect(() => {
    setSiteUrl(view.siteUrl ?? "");
  }, [view.siteUrl]);

  const saveClient = useMutation({
    mutationFn: () => saveGscClient({ data: { clientId, clientSecret } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.message(r.error);
      toast.message("OAuth client saved");
      setClientSecret("");
      onChange();
    },
  });
  const saveSa = useMutation({
    mutationFn: () => saveGscServiceAccount({ data: { json: saJson } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.message(r.error);
      toast.message(r.warning ?? `Service account ${r.serviceAccountEmail} saved`);
      setSaJson("");
      onChange();
    },
  });
  const connect = useMutation({
    mutationFn: () => startGscConnect(),
    onSuccess: (r) => {
      if (!r.ok) return toast.message(r.error);
      const opened = window.open(r.url, "norf-gsc", "width=520,height=720");
      if (!opened) window.location.assign(r.url);
    },
  });
  const pick = useMutation({
    mutationFn: () => selectGscProperty({ data: { siteUrl } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.message(r.error);
      toast.message("Property selected");
      onChange();
    },
  });
  const refresh = useMutation({
    mutationFn: () => refreshGsc({ data: { force: true } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.message(r.error);
      toast.message("Search Console data updated");
      onChange();
    },
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectGsc(),
    onSuccess: (r) => {
      if (!r.ok) return toast.message(r.error);
      toast.message("Search Console disconnected");
      onChange();
    },
  });

  const snapshot = view.snapshot;
  return (
    <section className="border border-line bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Search Console</h2>
          <p className="mt-2 max-w-2xl text-sm text-mute">{view.reason}</p>
          {view.lastError ? <p className="mt-2 text-sm text-bad">{view.lastError}</p> : null}
        </div>
        <StatusChip connected={view.connected} />
      </div>

      {view.connected ? (
        <div className="mt-5 space-y-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Meta label="Google account" value={view.googleEmail ?? "Not returned"} />
            <Meta label="Mode" value={view.mode === "service_account" ? "Service account" : "OAuth"} />
            <Meta label="Property" value={view.siteUrl ?? "Not selected"} />
            <Meta label="Last sync" value={view.lastSyncAt ? formatWhen(view.lastSyncAt) : "Never"} />
          </dl>
          {view.serviceAccountEmail ? (
            <p className="text-xs text-mute">
              Service account {view.serviceAccountEmail} must be added as a user on the Search Console property.
            </p>
          ) : null}
          {view.sites.length > 0 ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[16rem] flex-1">
                <Field label="Property">
                  <Select value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)}>
                    <option value="">Select a property</option>
                    {view.sites.map((s) => (
                      <option key={s.siteUrl} value={s.siteUrl}>
                        {s.siteUrl} ({s.permissionLevel || "access"})
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button variant="secondary" onClick={() => pick.mutate()} disabled={pick.isPending || !siteUrl}>
                {pick.isPending ? "Loading property" : "Use property"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-mute">
              No properties on this account yet. Add the site in Google Search Console, then refresh.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              {refresh.isPending ? "Refreshing" : "Refresh data"}
            </Button>
            <Button variant="danger" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
              Disconnect
            </Button>
          </div>
          {snapshot ? <GscSnapshotView snapshot={snapshot} /> : (
            <p className="text-sm text-mute">
              No Search Console rows loaded yet. Rankings stay empty until Google returns data.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-mute">
            <li>In Google Cloud, enable Search Console API.</li>
            <li>Create an OAuth client of type Web application.</li>
            <li>Add this redirect URI exactly: <span className="font-mono text-ink">{view.redirectUri ?? "https://norfai.com/api/gsc/callback"}</span></li>
            <li>Also add <span className="font-mono text-ink">https://www.norfai.com/api/gsc/callback</span> if the property is www.</li>
            <li>Paste the client ID and secret here, then connect with the Google account that owns norfai.com.</li>
          </ol>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="OAuth client ID">
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={view.clientIdHint ?? "….apps.googleusercontent.com"}
                autoComplete="off"
              />
            </Field>
            <Field label="OAuth client secret">
              <Input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={view.clientConfigured ? "Saved on server" : "GOCSPX-…"}
                autoComplete="off"
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => saveClient.mutate()} disabled={saveClient.isPending || !clientId}>
              {saveClient.isPending ? "Saving" : "Save OAuth client"}
            </Button>
            <Button onClick={() => connect.mutate()} disabled={connect.isPending || (!view.clientConfigured && !clientId)}>
              {connect.isPending ? "Opening Google" : "Connect Search Console"}
            </Button>
          </div>
          <button
            type="button"
            className="text-xs text-mute underline-offset-2 hover:text-ink hover:underline"
            onClick={() => setShowSa((v) => !v)}
          >
            {showSa ? "Hide service account" : "Use a service account instead"}
          </button>
          {showSa ? (
            <div className="space-y-3">
              <p className="text-sm text-mute">
                Paste a Google Cloud service account JSON key. Then add its email as a user on the Search Console property.
              </p>
              <Field label="Service account JSON">
                <Textarea value={saJson} onChange={(e) => setSaJson(e.target.value)} placeholder='{"type":"service_account",...}' />
              </Field>
              <Button variant="secondary" onClick={() => saveSa.mutate()} disabled={saveSa.isPending || !saJson.trim()}>
                {saveSa.isPending ? "Saving" : "Save service account"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function GscSnapshotView({ snapshot }: { snapshot: GscSnapshot }) {
  const t = snapshot.totals;
  return (
    <div className="space-y-5">
      <p className="text-xs uppercase tracking-[0.12em] text-faint">
        {snapshot.range.startDate} to {snapshot.range.endDate} · Google Search Console
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clicks" value={t.clicks} />
        <Stat label="Impressions" value={t.impressions} />
        <Stat label="CTR" value={`${(t.ctr * 100).toFixed(1)}%`} />
        <Stat label="Avg position" value={t.position ? t.position.toFixed(1) : "—"} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <MetricTable title="Queries" rows={snapshot.queries} keyLabel="Query" />
        <MetricTable title="Pages" rows={snapshot.pages} keyLabel="Page" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <MetricTable title="Countries" rows={snapshot.countries} keyLabel="Country" compact />
        <MetricTable title="Devices" rows={snapshot.devices} keyLabel="Device" compact />
      </div>
      <div>
        <h3 className="text-sm font-medium">Sitemaps</h3>
        <div className="mt-2 border border-line">
          {snapshot.sitemaps.length === 0 ? (
            <p className="px-3 py-3 text-sm text-mute">No sitemaps reported by Search Console.</p>
          ) : (
            snapshot.sitemaps.map((s) => (
              <div key={s.path} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-3 py-2 text-sm last:border-0">
                <span className="break-all font-mono text-xs">{s.path}</span>
                <span className="text-xs text-mute">
                  errors {s.errors} · warnings {s.warnings}
                  {s.isPending ? " · pending" : ""}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MetricTable({
  title,
  rows,
  keyLabel,
  compact,
}: {
  title: string;
  rows: GscMetricRow[];
  keyLabel: string;
  compact?: boolean;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="mt-2 overflow-x-auto border border-line">
        {rows.length === 0 ? (
          <p className="px-3 py-3 text-sm text-mute">No rows from Google for this period.</p>
        ) : (
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.12em] text-faint">
              <tr className="border-b border-line">
                <th className="px-3 py-2 font-medium">{keyLabel}</th>
                <th className="px-3 py-2 font-medium">Clicks</th>
                <th className="px-3 py-2 font-medium">Impr.</th>
                {!compact ? <th className="px-3 py-2 font-medium">CTR</th> : null}
                {!compact ? <th className="px-3 py-2 font-medium">Pos.</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-0">
                  <td className="max-w-[18rem] truncate px-3 py-2 font-mono text-xs" title={r.key}>{r.key || "—"}</td>
                  <td className="px-3 py-2 tabular">{r.clicks}</td>
                  <td className="px-3 py-2 tabular">{r.impressions}</td>
                  {!compact ? <td className="px-3 py-2 tabular">{(r.ctr * 100).toFixed(1)}%</td> : null}
                  {!compact ? <td className="px-3 py-2 tabular">{r.position.toFixed(1)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusChip({ connected }: { connected: boolean }) {
  return (
    <span className={`text-xs uppercase tracking-[0.14em] ${connected ? "text-good" : "text-faint"}`}>
      {connected ? "Connected" : "Not connected"}
    </span>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.14em] text-faint">{label}</dt>
      <dd className="mt-1 break-all">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border border-line bg-panel p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-faint">{label}</div>
      <div className="mt-2 font-mono text-2xl tabular">{value}</div>
    </div>
  );
}
