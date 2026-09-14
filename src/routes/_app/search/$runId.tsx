import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { buildExport, compareSearchRuns, controlRun, reEnrichCompanies, startSearch } from "@/lib/norr/actions";
import { Button } from "@/components/ui/button";
import { Pill, Stat, Empty } from "@/components/status";
import { ScoreBits, asCompanyIntel, contactFaceValue, decisionMakerFace } from "@/components/intel";
import { ProgressRail, ProgressRailPulse } from "@/components/progress-rail";
import { runProgress } from "@/lib/norr/progress";
import { formatQueueAge } from "@/lib/norr/queue-monitor";
import type { SearchCriteria } from "@/lib/norr/types";
import { describeCriteria } from "@/lib/norr/criteria";
import { skipPreviouslyShown } from "@/lib/norr/novelty";
import { faceRegisterDiagnosis, searchRunEmptyCopy, dropPrematureDiagnosis } from "@/lib/norr/face-diagnosis";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";

function download(filename: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type RunCompany = {
  id: string;
  name: string;
  business_id?: string | null;
  municipality?: string | null;
  website?: string | null;
  record_status?: string;
  decision_maker?: string | null;
  decision_title?: string | null;
  general_email?: string | null;
  phone?: string | null;
  match_score?: number | null;
  overall_confidence?: number | null;
  website_score?: number | null;
  seo_score?: number | null;
  commercial_opportunity?: number | null;
  company_age_years?: number | null;
  meta_ads?: string | null;
  intel?: unknown;
  seen_before?: boolean;
  times_seen_before?: number;
  last_shown_at?: string | null;
};

function seenLabel(c: RunCompany): string | null {
  if (!c.seen_before) return null;
  const n = c.times_seen_before ?? 0;
  const when = c.last_shown_at ? new Date(c.last_shown_at) : null;
  const date = when && Number.isFinite(when.getTime())
    ? when.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;
  if (n >= 2) return date ? `Seen ${n} times · last ${date}` : `Seen ${n} times`;
  return date ? `Seen before · ${date}` : "Seen before";
}

function sourceHitsLabel(
  r: { hits?: number; registerHits?: number },
  status: string,
): string {
  const stored = Number(r.hits ?? 0);
  const register = Number(r.registerHits ?? 0);
  if (stored > 0) return `${stored} hits`;
  if (register > 0) return `${register} in register`;
  if (status === "running" || status === "queued") return "searching";
  return "0 hits";
}

export const Route = createFileRoute("/_app/search/$runId")({ component: RunView });

function RunView() {
  const { runId } = Route.useParams();
  const nav = useNavigate();
  const { locale } = useI18n();
  const copy = loc(
    {
      fi: {
        findMissing: "Etsi puuttuvat sähköpostit ({n})",
        searchAgain: "Hae sähköpostit uudestaan",
        noneQueued: "Jokaisella osumalla on jo sähköposti, tai rivejä ei ole.",
        queued: "Haetaan julkaistuja osoitteita {n} yritykseltä. Hakemistot eivät kelpaa yrityksen sivuksi.",
      },
      en: {
        findMissing: "Find missing emails ({n})",
        searchAgain: "Search emails again",
        noneQueued: "Every match already has an email, or there are no rows.",
        queued: "Looking up published emails on {n} companies. Directory pages are not used as the company site.",
      },
      sv: {
        findMissing: "Hitta saknade e-postadresser ({n})",
        searchAgain: "Sök e-post igen",
        noneQueued: "Varje träff har redan e-post, eller så finns inga rader.",
        queued: "Söker publicerade adresser hos {n} bolag. Katalogsidor räknas inte som bolagets sajt.",
      },
    },
    locale,
  );
  const [extra, setExtra] = useState<RunCompany[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [csvPreset, setCsvPreset] = useState("full");
  const [diff, setDiff] = useState<null | { added: string[]; removed: string[]; kept: string[]; prevCount: number; nextCount: number }>(null);
  const q = useQuery({
    queryKey: ["run", runId],
    queryFn: async () => {
      const r = await fetch(`/api/search/run?id=${encodeURIComponent(runId)}`, {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const json = await r.json().catch(() => null);
      if (json?.ok) return json;
      return {
        ok: true,
        run: { id: runId, status: "queued", criteria: {}, name: "Search" },
        jobs: [],
        companies: [],
        progress: { pct: 5, stage: "queued", label: "Opening", done: 0, total: 1, running: true },
        summary: { matched: 0, missingEmail: 0, newToYou: 0, seenBefore: 0, excluded: 0 },
      };
    },
    placeholderData: {
      ok: true,
      run: { id: runId, status: "queued", criteria: {}, name: "Search" },
      jobs: [],
      companies: [],
      progress: { pct: 1, stage: "queued", label: "Queued", done: 0, total: 1, running: true },
      summary: { matched: 0, missingEmail: 0, newToYou: 0, seenBefore: 0, excluded: 0 },
    },
    refetchInterval: (query) => {
      const status = query.state.data && query.state.data.ok ? query.state.data.run.status : "";
      return status === "running" || status === "queued" ? 2000 : false;
    },
  });
  const enrich = useMutation({
    mutationFn: () => reEnrichCompanies({ data: { runId, missingOnly: true } }),
    onSuccess: (r) => {
      if ("ok" in r && r.ok === false) {
        toast.error("error" in r && typeof r.error === "string" ? r.error : "Re-enrich was refused.");
        return;
      }
      if (!r.queued) {
        toast.message(copy.noneQueued);
        return;
      }
      toast.message(copy.queued.replace("{n}", String(r.queued)));
      void q.refetch();
    },
    onError: () => toast.error("Re-enrich was refused."),
  });

  useEffect(() => {
    setExtra([]);
    setCursor(null);
  }, [runId]);

  const runStatus = q.data && q.data.ok ? q.data.run.status : "";
  useEffect(() => {
    if (runStatus !== "running" && runStatus !== "queued") return;
    let stop = false;
    const pulse = () => {
      if (stop) return;
      void fetch("/api/search/tick", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ runId }),
        signal: AbortSignal.timeout(4000),
      }).catch(() => {});
    };
    pulse();
    const t = setInterval(pulse, 2500);
    return () => {
      stop = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, runStatus]);

  useEffect(() => {
    if (q.data && q.data.ok && extra.length === 0) setCursor(q.data.nextCursor ?? null);
  }, [q.data, extra.length]);

  const pageCompanies = ((q.data && q.data.ok ? q.data.companies : []) ?? []) as RunCompany[];
  const companies = useMemo(() => {
    const seen = new Set<string>();
    const out: RunCompany[] = [];
    for (const c of [...pageCompanies, ...extra]) {
      if (!c?.id || seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
    return out;
  }, [pageCompanies, extra]);

  if (!q.data) {
    return (
      <div className="space-y-6">
        <ProgressRailPulse label="Opening this search" />
        <p className="text-sm text-mute">Loading run.</p>
      </div>
    );
  }
  if (!q.data.ok) return <p className="text-sm text-bad">{q.data.error}</p>;
  const { run, jobs, summary } = q.data;
  const missingEmail = Number((summary as { missingEmail?: number } | undefined)?.missingEmail ?? companies.filter((c) => !c.general_email).length);
  const foundEmail = Number((summary as { foundEmail?: number } | undefined)?.foundEmail ?? companies.filter((c) => c.general_email).length);
  const foundPhone = Number((summary as { foundPhone?: number } | undefined)?.foundPhone ?? companies.filter((c) => c.phone).length);
  const foundDecisionMaker = Number((summary as { foundDecisionMaker?: number } | undefined)?.foundDecisionMaker ?? companies.filter((c) => c.decision_maker).length);
  const missingPhone = Number((summary as { missingPhone?: number } | undefined)?.missingPhone ?? companies.filter((c) => !c.phone).length);
  const missingDecisionMaker = Number((summary as { missingDecisionMaker?: number } | undefined)?.missingDecisionMaker ?? companies.filter((c) => !c.decision_maker).length);
  const running = run.status === "running" || run.status === "queued";
  const emailJobs = (jobs as Array<{ type?: string; status?: string }>).filter((j) => j.type === "email");
  const emailQueued = emailJobs.filter((j) => j.status === "queued" || j.status === "running").length;
  const emailDone = emailJobs.filter((j) => j.status === "done").length;
  const stats = (run.stats ?? {}) as Record<string, number>;
  const report = dropPrematureDiagnosis(((run.source_report ?? []) as Array<{
    source: string;
    ok: boolean;
    error?: string | null;
    hits?: number;
    registerHits?: number;
    note?: string | null;
    code?: string;
  }>), run.status);
  const criteria = (run.criteria ?? {}) as SearchCriteria;
  const progress = (q.data as { progress?: ReturnType<typeof runProgress> }).progress
    ?? runProgress(jobs as Array<{ type?: string; status?: string }>, run.status);
  const diagnosis = summary?.diagnosis
    ?? faceRegisterDiagnosis(report, { companyCount: companies.length, status: run.status });
  const emptyCopy = searchRunEmptyCopy({
    status: run.status,
    skipSeen: skipPreviouslyShown(criteria),
    emptyNewMessage: summary?.emptyNew ? summary.emptyNewMessage : "",
    diagnosis: companies.length === 0 ? diagnosis : (diagnosis?.code === "PARTIAL" ? diagnosis : null),
  });

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await fetch(`/api/search/run?id=${encodeURIComponent(runId)}`, {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const next = await r.json();
      if (next.ok) {
        setExtra((prev) => [...prev, ...(next.companies as RunCompany[])]);
        setCursor(next.nextCursor ?? null);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  async function exportRun() {
    try {
      const r = await buildExport({ data: { format: "csv", runId, includeProvenance: true, scope: "run", preset: csvPreset } });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      download(r.filename, r.mime, r.body);
      toast.message(`${r.rowCount} rows exported from this search`);
    } catch {
      toast.error("Export failed");
    }
  }

  async function runAgain() {
    try {
      const res = await startSearch({ data: { criteria, name: (run as { name?: string }).name } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      nav({ to: "/search/$runId", params: { runId: res.runId } });
    } catch {
      toast.error("Search could not start. Try again.");
    }
  }

  function duplicate() {
    try {
      window.sessionStorage.setItem("norf-duplicate-criteria", JSON.stringify(criteria));
      const n = (run as { name?: string }).name;
      if (n) window.sessionStorage.setItem("norf-duplicate-name", n);
    } catch {
      /* ignore */
    }
    nav({ to: "/search/new" });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Search execution</h1>
          <p className="mt-1 font-mono text-xs text-mute">{runId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={csvPreset}
            onChange={(e) => setCsvPreset(e.target.value)}
            className="border border-line bg-panel px-3 py-2 text-sm"
            aria-label="CSV columns"
          >
            <option value="full">CSV: full</option>
            <option value="basic">CSV: basic</option>
            <option value="sales">CSV: sales</option>
            <option value="financial">CSV: financial</option>
            <option value="marketing">CSV: marketing</option>
          </select>
          <Button variant="secondary" onClick={() => void exportRun()}>Export this run</Button>
          <Button variant="secondary" onClick={() => void runAgain()}>Run again</Button>
          <Button variant="secondary" onClick={() => duplicate()}>Duplicate</Button>
          <Button
            variant="secondary"
            disabled={enrich.isPending || emailQueued > 0}
            onClick={() => enrich.mutate()}
          >
            {missingEmail > 0 ? copy.findMissing.replace("{n}", String(missingEmail)) : copy.searchAgain}
          </Button>
          {q.data.previousRunId ? (
            <Button
              variant="secondary"
              onClick={() => {
                const prevId = q.data.previousRunId as string;
                void compareSearchRuns({ data: { prevId, nextId: runId } }).then((r) => {
                  if (r.ok) setDiff(r);
                  else toast.error(r.error ?? "Compare failed");
                });
              }}
            >
              Compare with previous
            </Button>
          ) : null}
          {run.status === "running" ? (
            <Button variant="secondary" onClick={() => controlRun({ data: { runId, action: "pause" } }).then(() => q.refetch())}>Pause</Button>
          ) : run.status === "paused" ? (
            <Button variant="secondary" onClick={() => controlRun({ data: { runId, action: "resume" } }).then(() => q.refetch())}>Resume</Button>
          ) : null}
          {run.status !== "cancelled" && run.status !== "completed" ? (
            <Button variant="danger" onClick={() => controlRun({ data: { runId, action: "cancel" } }).then(() => q.refetch())}>Cancel</Button>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Pill tone={run.status === "completed" ? "good" : run.status === "failed" ? "bad" : "info"}>{run.status}</Pill>
        {run.error ? <span className="text-sm text-bad">{run.error}</span> : null}
      </div>
      <div className="panel p-4">
        <ProgressRail
          value={progress.pct}
          label={progress.label}
          running={progress.running}
          hint={
            progress.running
              ? `${progress.done} of ${progress.total} jobs. Registers, websites and contacts usually land within a few minutes.`
              : progress.total
                ? `${progress.done} jobs finished.`
                : undefined
          }
        />
      </div>
      {emailJobs.length > 0 ? (
        <p className="text-sm text-mute">
          Contact enrichment: {emailDone}/{emailJobs.length} companies processed
          {emailQueued > 0 ? ` · ${emailQueued} running` : ""}.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Matched" value={summary?.matched ?? stats.discovered ?? 0} />
        <Stat label="New to you" value={summary?.newToYou ?? 0} />
        <Stat label="Seen before" value={summary?.seenBefore ?? 0} />
        <Stat label="Email" value={foundEmail} hint={`${foundEmail} found · ${missingEmail} missing`} />
        <Stat label="Phone" value={foundPhone} hint={`${foundPhone} found · ${missingPhone} missing`} />
        <Stat label="Decision-maker" value={foundDecisionMaker} hint={`${foundDecisionMaker} found · ${missingDecisionMaker} missing`} />
      </div>
      {diff ? (
        <div className="border border-line bg-panel p-4 text-sm">
          <p className="font-medium">Compared with the previous search using the same filters</p>
          <p className="mt-2 text-mute">
            New matches {diff.added.length}. Repeated {diff.kept.length}. No longer matching {diff.removed.length}.
          </p>
        </div>
      ) : null}
      {summary?.limitedNew ? (
        <div role="alert" className="border border-bad/50 bg-bad/10 p-4 text-sm text-bad">
          <p className="font-medium">LIMITED NEW RESULTS</p>
          <p className="mt-1">{summary.limitedNewMessage}</p>
          <p className="mt-2 text-xs">Widen filters, include another region, expand the revenue range, or change industry criteria.</p>
        </div>
      ) : null}
      {diagnosis && (companies.length === 0 || diagnosis.code === "PARTIAL") && run.status !== "running" && run.status !== "queued" ? (
        <div
          role={diagnosis.tone === "bad" ? "alert" : "status"}
          className={
            diagnosis.tone === "bad"
              ? "border border-bad/50 bg-bad/10 p-4 text-sm"
              : "border border-line bg-panel p-4 text-sm"
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{diagnosis.title}</p>
            <Pill tone={diagnosis.tone}>{diagnosis.code.replaceAll("_", " ")}</Pill>
          </div>
          <p className={`mt-1 ${diagnosis.tone === "bad" ? "text-bad" : "text-mute"}`}>{diagnosis.detail}</p>
        </div>
      ) : summary?.emptyNew && !diagnosis ? (
        <div role="status" className="border border-line bg-panel p-4 text-sm">
          <p className="font-medium">No new companies currently match these filters.</p>
          <p className="mt-1 text-mute">{summary.emptyNewMessage}</p>
        </div>
      ) : null}
      {summary?.coverage && summary.coverage.code && summary.coverage.code !== "OK" && run.status !== "running" && run.status !== "queued" ? (
        <div role="status" className="border border-line bg-panel p-4 text-sm">
          <p className="font-medium">{summary.coverage.headline}</p>
          <p className="mt-1 text-mute">{summary.coverage.detail}</p>
        </div>
      ) : null}
      {summary && summary.excluded > 0 ? (
        <p className="text-sm text-mute">{summary.excluded} companies were excluded because you chose to skip previously shown or exported records.</p>
      ) : null}
      {criteria.groups ? (
        <section className="border border-line bg-panel p-4">
          <h2 className="mb-2 text-sm font-medium">This search</h2>
          <p className="text-sm text-mute">{describeCriteria(criteria)}</p>
        </section>
      ) : null}
      <section>
        <h2 className="mb-2 text-sm font-medium">Source report</h2>
        <div className="border border-line">
          {report.length === 0 ? <p className="px-3 py-2 text-sm text-mute">Waiting for the first source call.</p> : null}
          {report.map((r, i) => (
            <div key={i} className="flex items-start justify-between gap-3 border-b border-line px-3 py-2 text-sm last:border-0">
              <div className="min-w-0">
                <span>{r.source}</span>
                {r.note ? <p className="mt-0.5 text-xs text-mute">{r.note}</p> : null}
              </div>
              <span className={r.ok ? "shrink-0 text-good" : "shrink-0 text-bad"}>
                {r.ok ? sourceHitsLabel(r, run.status) : r.error}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-1 text-sm font-medium">Partial results</h2>
        <p className="mb-3 text-xs text-mute">
          Email, phone and decision-maker are first. Published values appear as soon as they are stored.
          {running ? " Pending means this company is still being enriched." : ""}
        </p>
        <div className="grid gap-3 md:hidden">
          {companies.length === 0 ? (
            <Empty title={emptyCopy.title} body={emptyCopy.detail} />
          ) : companies.map((c) => (
            <Link key={c.id} to="/companies/$companyId" params={{ companyId: c.id }} className="block border border-line bg-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium leading-snug">{c.name}</div>
                  <div className="mt-1 font-mono text-xs text-mute">{c.business_id ?? "No Y-tunnus"}{c.municipality ? ` · ${c.municipality}` : ""}</div>
                  {seenLabel(c) ? <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-faint">{seenLabel(c)}</div> : null}
                </div>
                <Pill>{c.record_status}</Pill>
              </div>
              <dl className="mt-3 grid gap-1 text-sm">
                <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-2">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-faint">Email</dt>
                  <dd className="break-all">{contactFaceValue(c.general_email, { running, recordStatus: c.record_status })}</dd>
                </div>
                <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-2">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-faint">Phone</dt>
                  <dd>{contactFaceValue(c.phone, { running, recordStatus: c.record_status })}</dd>
                </div>
                <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-2">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-faint">Decision</dt>
                  <dd>{decisionMakerFace(c.decision_maker, c.decision_title, { running, recordStatus: c.record_status })}</dd>
                </div>
                <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-2">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-faint">Website</dt>
                  <dd className="break-all">{c.website ? c.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : contactFaceValue(null, { running, recordStatus: c.record_status })}</dd>
                </div>
              </dl>
              <ScoreBits
                match={c.match_score ?? c.overall_confidence}
                website={c.website_score}
                seo={c.seo_score}
                opportunity={c.commercial_opportunity}
                ageYears={c.company_age_years}
                metaAds={c.meta_ads}
                hasWebsite={Boolean(c.website)}
                hiring={asCompanyIntel(c.intel)?.hiring?.evidence}
              />
              {asCompanyIntel(c.intel)?.match?.why?.[0] ? (
                <p className="mt-2 text-xs text-mute">{asCompanyIntel(c.intel)!.match.why[0]}</p>
              ) : null}
            </Link>
          ))}
        </div>
        <div className="hidden md:block overflow-hidden">
        <table className="w-full table-fixed border border-line text-left text-sm">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[20%]" />
            <col className="w-[14%]" />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
            <col className="w-[10%]" />
            <col className="w-[6%]" />
          </colgroup>
          <thead className="bg-panel text-[11px] uppercase tracking-[0.12em] text-faint">
            <tr>
              {["Company", "Email", "Phone", "Decision-maker", "Website", "Y-tunnus", "Status"].map((h) => (
                <th key={h} className="border-b border-line px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6">
                <p className="font-medium text-ink">{emptyCopy.title}</p>
                <p className="mt-1 text-mute">{emptyCopy.detail}</p>
              </td></tr>
            ) : companies.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0 hover:bg-panel-2">
                <td className="px-3 py-2">
                  <Link className="hover:underline" to="/companies/$companyId" params={{ companyId: c.id }}>{c.name}</Link>
                  {seenLabel(c) ? <div className="text-[11px] text-faint">{seenLabel(c)}</div> : null}
                </td>
                <td className="truncate px-3 py-2 text-xs">{contactFaceValue(c.general_email, { running, recordStatus: c.record_status })}</td>
                <td className="truncate px-3 py-2 text-xs">{contactFaceValue(c.phone, { running, recordStatus: c.record_status })}</td>
                <td className="truncate px-3 py-2 text-xs">{decisionMakerFace(c.decision_maker, c.decision_title, { running, recordStatus: c.record_status })}</td>
                <td className="truncate px-3 py-2 text-xs">{c.website ? c.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : contactFaceValue(null, { running, recordStatus: c.record_status })}</td>
                <td className="px-3 py-2 font-mono text-xs">{c.business_id ?? "Not found"}</td>
                <td className="px-3 py-2"><Pill>{c.record_status}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {cursor ? (
          <div className="mt-3">
            <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? "Loading" : "Load more"}
            </Button>
          </div>
        ) : null}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-medium">Jobs</h2>
        {(() => {
          const live = (q.data as { liveQueue?: { queued?: number; running?: number; depth?: number; oldestQueuedMs?: number | null } } | undefined)?.liveQueue;
          if (!live || !(live.depth ?? 0)) return null;
          return (
            <p className="mb-2 text-xs text-mute">
              {live.queued ?? 0} queued · {live.running ?? 0} running
              {live.oldestQueuedMs ? ` · oldest ${formatQueueAge(live.oldestQueuedMs)}` : ""}
            </p>
          );
        })()}
        <div className="max-h-64 overflow-auto border border-line text-xs">
          {(((q.data as { jobCounts?: Array<{ type: string; status: string; n: number }> }).jobCounts) ?? []).length ? (
            Array.from(
              new Map(
                ((q.data as { jobCounts: Array<{ type: string; status: string; n: number }> }).jobCounts).map((row) => [row.type, true]),
              ).keys(),
            ).map((type) => {
              const rows = (q.data as { jobCounts: Array<{ type: string; status: string; n: number }> }).jobCounts.filter((r) => r.type === type);
              const total = rows.reduce((a, r) => a + Number(r.n ?? 0), 0);
              const bits = rows.map((r) => `${r.n} ${r.status}`).join(" · ");
              return (
                <div key={type} className="flex justify-between gap-3 border-b border-line px-3 py-1.5 last:border-0">
                  <span className="font-mono text-mute">{type}</span>
                  <span>{total} · {bits}</span>
                </div>
              );
            })
          ) : jobs.map((j: { id: string; type: string; status: string; last_error?: string | null }) => (
            <div key={j.id} className="flex justify-between gap-3 border-b border-line px-3 py-1.5 last:border-0">
              <span className="font-mono text-mute">{j.type}</span>
              <span>{j.status}{j.last_error ? ` · ${j.last_error}` : ""}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
