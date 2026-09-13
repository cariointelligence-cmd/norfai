import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { controlRun, listJobs, tickSearch } from "@/lib/norr/actions";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/status";
import { formatWhen, asDisplay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";

export const Route = createFileRoute("/_app/jobs")({ component: Jobs });

function Jobs() {
  const { locale } = useI18n();
  const copy = loc(
    {
      fi: {
        title: "Työt", next: "Käsittele jono", empty: "Ei töitä jonossa.", type: "Tyyppi", status: "Tila",
        attempts: "Yritykset", error: "Virhe", created: "Luotu", live: "Jonossa", running: "Ajossa",
        oldest: "Vanhin", runs: "Haut", jobsOnRun: "työtä", companies: "yritystä", cancel: "Peruuta",
        noneLive: "Ei keskeneräisiä hakuja.", hint: "Valmiit haut eivät pidä töitä. Vanhat juuttuneet haut suljetaan automaattisesti.",
      },
      en: {
        title: "Job monitoring", next: "Process queue", empty: "No jobs in queue.", type: "Type", status: "Status",
        attempts: "Attempts", error: "Error", created: "Created", live: "Queued", running: "Running",
        oldest: "Oldest", runs: "Searches", jobsOnRun: "jobs", companies: "companies", cancel: "Cancel",
        noneLive: "No unfinished searches.", hint: "Finished searches do not keep jobs. Stuck searches older than 20 minutes are closed automatically.",
      },
      sv: {
        title: "Jobb", next: "Bearbeta kö", empty: "Inga jobb i kön.", type: "Typ", status: "Status",
        attempts: "Försök", error: "Fel", created: "Skapad", live: "I kö", running: "Körs",
        oldest: "Äldsta", runs: "Sökningar", jobsOnRun: "jobb", companies: "företag", cancel: "Avbryt",
        noneLive: "Inga oavslutade sökningar.", hint: "Färdiga sökningar håller inga jobb. Fastnade sökningar stängs automatiskt.",
      },
    },
    locale,
  );
  const q = useQuery({ queryKey: ["jobs"], queryFn: () => listJobs(), refetchInterval: 4000 });
  const rows = (q.data?.jobs ?? []) as Array<{
    id: string; type: string; status: string; last_error: string | null; attempts: number; created_at: string; run_id?: string | null;
  }>;
  const summary = (q.data?.summary ?? {}) as {
    queued?: number; running?: number; live?: number; oldestS?: number | null;
    byType?: Array<{ type: string; queued: number; running: number }>;
  };
  const runRows = (q.data?.runs ?? []) as Array<{
    id: string; status: string; created_at: string; name?: string | null;
    stats?: Record<string, number> | null; live_jobs?: number;
  }>;
  const liveRuns = runRows.filter((r) => r.status === "running" || r.status === "queued" || (r.live_jobs ?? 0) > 0);
  const pastRuns = runRows.filter((r) => !liveRuns.includes(r)).slice(0, 12);
  const oldest = summary.oldestS != null ? formatAge(summary.oldestS) : "—";

  async function process() {
    await tickSearch({ data: { steps: 8 } });
    await q.refetch();
  }
  async function cancelRun(runId: string) {
    await controlRun({ data: { runId, action: "cancel" } });
    await q.refetch();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">{copy.title}</h1>
          <p className="mt-1 max-w-xl text-xs text-mute">{copy.hint}</p>
        </div>
        <Button variant="secondary" onClick={() => void process()}>{copy.next}</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Card label={copy.live} value={summary.queued ?? 0} />
        <Card label={copy.running} value={summary.running ?? 0} />
        <Card label={copy.oldest} value={oldest} />
        <Card label={copy.runs} value={liveRuns.length} />
      </div>
      {(summary.byType ?? []).length ? (
        <div className="flex flex-wrap gap-1.5">
          {(summary.byType ?? []).map((t) => (
            <Pill key={t.type} tone={(t.queued + t.running) > 0 ? "warn" : "mute"}>
              {t.type} {t.queued + t.running}
            </Pill>
          ))}
        </div>
      ) : null}
      <section>
        <h2 className="mb-2 text-sm font-medium">{copy.runs}</h2>
        <div className="border border-line">
          {liveRuns.length === 0 ? <p className="px-3 py-3 text-sm text-mute">{copy.noneLive}</p> : liveRuns.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 text-sm last:border-0">
              <span className="font-mono text-xs">
                <Link className="hover:underline" to="/search/$runId" params={{ runId: r.id }}>{asDisplay(r.name) || asDisplay(r.id).slice(0, 8)}</Link>
              </span>
              <span className="text-xs text-mute">{formatWhen(r.created_at, "-", locale)}</span>
              <span className="font-mono text-xs tabular">{r.live_jobs ?? 0} {copy.jobsOnRun} · {Number(r.stats?.discovered ?? r.stats?.companies ?? 0)} {copy.companies}</span>
              <Pill tone="warn">{asDisplay(r.status)}</Pill>
              <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => void cancelRun(r.id)}>{copy.cancel}</Button>
            </div>
          ))}
        </div>
        {pastRuns.length ? (
          <div className="mt-3 border border-line">
            {pastRuns.map((r) => (
              <div key={r.id} className="flex justify-between border-b border-line px-3 py-1.5 text-sm last:border-0">
                <span className="font-mono text-xs"><Link className="hover:underline" to="/search/$runId" params={{ runId: r.id }}>{asDisplay(r.name) || asDisplay(r.id).slice(0, 8)}</Link></span>
                <span className="text-xs text-mute">{formatWhen(r.created_at, "-", locale)}</span>
                <Pill tone={r.status === "completed" ? "good" : r.status === "cancelled" ? "mute" : "mute"}>{asDisplay(r.status)}</Pill>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <section className="overflow-x-auto">
        <table className="w-full min-w-[640px] border border-line text-sm">
          <thead className="bg-panel text-[11px] uppercase tracking-[0.12em] text-faint">
            <tr>{[copy.type, copy.status, copy.attempts, copy.error, copy.created].map((h) => <th key={h} className="border-b border-line px-3 py-2 text-left">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-mute">{copy.empty}</td></tr>
            ) : rows.map((j) => (
              <tr key={j.id} className="border-b border-line">
                <td className="px-3 py-2 font-mono text-xs">{asDisplay(j.type)}{j.run_id ? ` · ${String(j.run_id).slice(0, 8)}` : ""}</td>
                <td className="px-3 py-2"><Pill tone={j.status === "failed" ? "bad" : j.status === "running" ? "warn" : "mute"}>{asDisplay(j.status)}</Pill></td>
                <td className="px-3 py-2 font-mono">{asDisplay(j.attempts, "0")}</td>
                <td className="px-3 py-2 text-xs text-bad">{asDisplay(j.last_error)}</td>
                <td className="px-3 py-2 text-xs text-mute">{formatWhen(j.created_at, "-", locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-line bg-panel px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.12em] text-faint">{label}</p>
      <p className="mt-1 font-mono text-xl tabular">{value}</p>
    </div>
  );
}

function formatAge(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}
