import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildExport, listCompanies, reEnrichCompanies, tickSearch } from "@/lib/norr/actions";
import { BOOTSTRAP_QUERY } from "@/lib/client/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Empty, Pill } from "@/components/status";
import { ScoreBits, asCompanyIntel, formatEuro, scoreLabel } from "@/components/intel";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/companies/")({ component: Companies });

function download(filename: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function hostOf(url: string | null): string {
  if (!url) return "Not found";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

function ContactLine({ label, value, extra }: { label: string; value: string; extra?: ReactNode }) {
  const missing = !value || value === "Not found";
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 text-sm">
      <span className="text-[11px] uppercase tracking-[0.12em] text-faint">{label}</span>
      <span className={missing ? "text-mute" : "break-all text-ink"}>
        {value}
        {extra}
      </span>
    </div>
  );
}

function Companies() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [email, setEmail] = useState("");
  const [outcome, setOutcome] = useState("");
  const [sortBy, setSortBy] = useState("match");
  const qc = useQueryClient();
  const boot = useQuery(BOOTSTRAP_QUERY);
  const jobsRunning = boot.data?.counts.jobsRunning ?? 0;
  const list = useQuery({
    queryKey: ["companies", q, status, email, sortBy, outcome],
    queryFn: () =>
      listCompanies({
        data: {
          q,
          status,
          outcome,
          hasEmail: email === "any" || email === "published" || email === "inferred",
          publishedOnly: email === "published",
          inferredOnly: email === "inferred",
          sortBy,
        },
      }),
    refetchInterval: jobsRunning > 0 ? 2500 : false,
  });
  const queuedBackfill = list.data?.queuedContactJobs ?? 0;
  const searchingJobs = jobsRunning + queuedBackfill;

  useEffect(() => {
    if (queuedBackfill > 0) void qc.invalidateQueries({ queryKey: ["bootstrap"] });
  }, [queuedBackfill, qc]);

  useEffect(() => {
    if (searchingJobs <= 0) return;
    let stop = false;
    let inflight = false;
    const pulse = async () => {
      if (stop || inflight) return;
      inflight = true;
      try {
        await tickSearch({ data: { steps: 6 } });
        if (!stop) {
          await qc.invalidateQueries({ queryKey: ["companies"] });
          await qc.invalidateQueries({ queryKey: ["bootstrap"] });
        }
      } finally {
        inflight = false;
      }
    };
    void pulse();
    const t = setInterval(() => { void pulse(); }, 2800);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [searchingJobs, qc]);
  const exp = useMutation({
    mutationFn: () => buildExport({ data: { format: "csv", includeProvenance: true, scope: "filtered" } }),
    onSuccess: (r) => {
      download(r.filename, r.mime, r.body);
      toast.message(`Exported ${r.rowCount} rows`);
    },
  });
  const enrich = useMutation({
    mutationFn: () => reEnrichCompanies({ data: { missingOnly: true } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["companies"] });
      void qc.invalidateQueries({ queryKey: ["bootstrap"] });
      if ("ok" in r && r.ok === false) {
        toast.error("error" in r && typeof r.error === "string" ? r.error : "Re-enrich was refused.");
        return;
      }
      if (!r.queued) {
        toast.message("Every listed company already has URL, email, phone and a decision-maker, or no rows exist.");
        return;
      }
      toast.message(`Searching ${r.queued} companies on Finder, company sites, DuckDuckGo, LinkedIn and YTJ. Fields merge even when they come from different sources.`);
    },
  });
  const rows = list.data?.companies ?? [];
  const missing = rows.filter((c: any) => !c.website || !c.general_email || !c.phone || !c.decision_maker).length;
  const searching = enrich.isPending || searchingJobs > 0;

  return (
    <div className="space-y-4 overflow-x-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium tracking-tight">Companies</h1>
          <p className="text-sm text-mute">
            {rows.length} records. Live query, no placeholders. Match, website and opportunity scores fill in after the public site is crawled. Missing fields stay Not found.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          <Button
            className="w-full sm:w-auto"
            variant={missing ? "primary" : "secondary"}
            onClick={() => enrich.mutate()}
            disabled={enrich.isPending || rows.length === 0}
          >
            {searching ? "Searching sources…" : missing ? `Find URL / people / email / phone (${missing})` : "Re-search contacts"}
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => exp.mutate()} disabled={exp.isPending || rows.length === 0}>Export CSV</Button>
            <Link to="/search/new" className="cta-ghost flex-1 sm:flex-none">New search</Link>
          </div>
        </div>
      </div>
      {searchingJobs > 0 ? (
        <p className="border border-line bg-panel px-3 py-2 text-sm text-mute">
          Searching {searchingJobs} jobs across YTJ, Wikidata, Wikipedia, DuckDuckGo, OpenStreetMap and the company site. Fields merge onto the same company even when they come from different sources. This list refreshes as they land.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Name, Y-tunnus, municipality" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="h-11 min-h-11 border border-line bg-canvas px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="discovered">discovered</option>
          <option value="enriched">enriched</option>
          <option value="verified">verified</option>
          <option value="rejected">rejected</option>
        </select>
        <select className="h-10 min-h-10 border border-line bg-canvas px-3 text-sm" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="">Any activity</option>
          <option value="called">Called</option>
          <option value="no_answer">No answer</option>
          <option value="lead">Lead</option>
          <option value="not_fit">Not a fit</option>
          <option value="won">Won</option>
        </select>
        <select className="h-10 min-h-10 border border-line bg-canvas px-3 text-sm" value={email} onChange={(e) => setEmail(e.target.value)}>
          <option value="">Any email</option>
          <option value="any">Has email</option>
          <option value="published">Published only</option>
          <option value="inferred">Inferred only</option>
        </select>
        <select className="h-10 min-h-10 border border-line bg-canvas px-3 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="match">Sort: match</option>
          <option value="opportunity">Sort: commercial opportunity</option>
          <option value="website">Sort: website quality</option>
          <option value="seo">Sort: SEO</option>
          <option value="digital">Sort: digital maturity</option>
          <option value="age">Sort: company age</option>
        </select>
      </div>
      {rows.length === 0 ? (
        <Empty title="No matching companies" body="The database has no rows for this filter. Run a search against YTJ or widen the query." />
      ) : (
        <>
          <div className="norr-mobile-cards grid gap-3 xl:hidden">
            {rows.map((c: any) => (
              <Link
                key={c.id}
                to="/companies/$companyId"
                params={{ companyId: c.id }}
                className="block min-w-0 border border-line bg-panel p-4 hover:border-line-strong"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="break-words text-base font-medium leading-snug">{c.name}</div>
                    <div className="mt-1 font-mono text-xs text-mute">
                      {c.business_id ?? "No Y-tunnus"}
                      {c.municipality ? ` · ${c.municipality}` : ""}
                    </div>
                    {c.industry_label ? (
                      <div className="mt-1 break-words text-xs text-faint">{c.industry_label}</div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Pill>{c.record_status}</Pill>
                    <span className="font-mono text-xs tabular text-mute">{scoreLabel(c.match_score ?? c.overall_confidence)}</span>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <ContactLine
                    label="Website"
                    value={hostOf(c.website)}
                    extra={c.website ? (
                      <span className="ml-2 text-xs text-faint">↗</span>
                    ) : null}
                  />
                  <ContactLine
                    label="Decision"
                    value={c.decision_maker ? `${c.decision_maker}${c.decision_title ? ` · ${c.decision_title}` : ""}` : "Not found"}
                  />
                  <ContactLine
                    label="Email"
                    value={c.general_email ?? "Not found"}
                    extra={c.general_email_class === "inferred" ? <span className="ml-2"><Pill tone="warn">inferred</Pill></span> : c.general_email ? <span className="ml-2"><Pill tone="good">published</Pill></span> : null}
                  />
                  <ContactLine label="Phone" value={c.phone ?? "Not found"} extra={c.phone_class ? <span className="ml-2 text-xs text-faint">{String(c.phone_class)}</span> : null} />
                </div>
                {c.activity_outcome ? <div className="mt-2"><Pill tone="info">{String(c.activity_outcome).replace("_", " ")}</Pill></div> : null}
                {c.parent_name ? <div className="mt-1 text-xs text-mute">Group: {c.parent_name}</div> : null}
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
                {c.revenue ? <div className="mt-2 text-xs text-mute">Revenue {formatEuro(c.revenue)}</div> : null}
              </Link>
            ))}
          </div>
          <div className="norr-desktop-table hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[1240px] border border-line text-left text-sm">
              <thead className="bg-panel text-[11px] uppercase tracking-[0.12em] text-faint">
                <tr>{["Name","Y-tunnus","Place","Website","Decision-maker","Email","Phone","Match","Site","Opp","Status"].map((h) => <th key={h} className="border-b border-line px-3 py-2">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((c: any) => (
                  <tr key={c.id} className="border-b border-line hover:bg-panel-2">
                    <td className="max-w-[280px] px-3 py-2">
                      <Link className="break-words hover:underline" to="/companies/$companyId" params={{ companyId: c.id }}>{c.name}</Link>
                      {c.industry_label ? <div className="mt-0.5 text-xs text-faint">{c.industry_label}</div> : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{c.business_id ?? "Not found"}</td>
                    <td className="px-3 py-2 text-mute">{c.municipality ?? "Not found"}</td>
                    <td className="px-3 py-2 text-xs">
                      {c.website ? (
                        <a className="text-ink underline decoration-line underline-offset-2" href={c.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          {hostOf(c.website)}
                        </a>
                      ) : "Not found"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {c.decision_maker ? (
                        <span>{c.decision_maker}<span className="block text-mute">{c.decision_title}</span></span>
                      ) : "Not found"}
                    </td>
                    <td className="px-3 py-2 text-xs">{c.general_email ?? "Not found"} {c.general_email_class === "inferred" ? <Pill tone="warn">inferred</Pill> : c.general_email ? <Pill tone="good">published</Pill> : null}</td>
                    <td className="px-3 py-2 text-xs">{c.phone ?? "Not found"}{c.phone_class ? <span className="block text-faint">{c.phone_class}</span> : null}</td>
                    <td className="px-3 py-2 font-mono tabular">{scoreLabel(c.match_score ?? c.overall_confidence)}</td>
                    <td className="px-3 py-2 font-mono tabular">{scoreLabel(c.website_score, { pending: Boolean(c.website) })}</td>
                    <td className="px-3 py-2 font-mono tabular">{scoreLabel(c.commercial_opportunity)}</td>
                    <td className="px-3 py-2">
                      <Pill>{c.record_status}</Pill>
                      {c.activity_outcome ? <div className="mt-1"><Pill tone="info">{String(c.activity_outcome).replace("_", " ")}</Pill></div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
