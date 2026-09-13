import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listRuns, startSearch } from "@/lib/norr/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Empty, Pill } from "@/components/status";
import { describeCriteria } from "@/lib/norr/criteria";
import type { SearchCriteria } from "@/lib/norr/types";
import { useState } from "react";
import { toast } from "sonner";
import { formatWhen, asDisplay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";

export const Route = createFileRoute("/_app/search/")({ component: SearchHistory });

type RunRow = {
  id: string;
  status: string;
  created_at: string;
  finished_at: string | null;
  stats: Record<string, number> | null;
  name?: string | null;
  new_leads_count?: number | null;
  previously_seen_count?: number | null;
  excluded_count?: number | null;
  criteria?: SearchCriteria;
};

function SearchHistory() {
  const { locale, ta } = useI18n();
  const copy = loc(
    {
      fi: {
        title: "Aiemmat haut",
        body: "Palvelimen historia. Avaa ei muuta hakua. Aja uudelleen tekee uuden ajon tuoreella datalla.",
        empty: "Ei aiempia hakuja",
        emptyBody: "Aloita haku, niin se näkyy täällä myös muilla laitteilla.",
        noFilters: "Tällä haulla ei ole tallennettuja ehtoja.",
        startFail: "Haku ei käynnistynyt. Yritä uudelleen.",
        byName: "Hae nimellä",
        allStatus: "Kaikki tilat",
        running: "Käynnissä",
        completed: "Valmis",
        failed: "Epäonnistui",
        cancelled: "Peruttu",
        paused: "Tauolla",
        anyDate: "Mikä tahansa päivä",
        d7: "7 päivää",
        d30: "30 päivää",
        d90: "90 päivää",
        results: "Tulokset",
        newN: "Uudet",
        seen: "Nähty aiemmin",
        excluded: "Pois rajattu",
        open: "Avaa",
        again: "Aja uudelleen",
        dup: "Kopioi ehdot",
        unnamed: "Haku",
      },
      en: {
        title: "Previous searches",
        body: "Server-side history. Opening a run does not change it. Run again creates a new run with the latest data.",
        empty: "No previous searches",
        emptyBody: "Start a search and it will appear here, including on other devices.",
        noFilters: "This search has no saved filters.",
        startFail: "Search could not start. Try again.",
        byName: "Search by name",
        allStatus: "All statuses",
        running: "Running",
        completed: "Completed",
        failed: "Failed",
        cancelled: "Cancelled",
        paused: "Paused",
        anyDate: "Any date",
        d7: "Last 7 days",
        d30: "Last 30 days",
        d90: "Last 90 days",
        results: "Results",
        newN: "New",
        seen: "Previously seen",
        excluded: "Excluded",
        open: "Open",
        again: "Run again",
        dup: "Duplicate",
        unnamed: "Search",
      },
      sv: {
        title: "Tidigare sökningar",
        body: "Serverhistorik. Att öppna en körning ändrar den inte. Kör igen skapar en ny körning med senaste data.",
        empty: "Inga tidigare sökningar",
        emptyBody: "Starta en sökning så visas den här, även på andra enheter.",
        noFilters: "Den här sökningen har inga sparade filter.",
        startFail: "Sökningen kunde inte starta. Försök igen.",
        byName: "Sök på namn",
        allStatus: "Alla statusar",
        running: "Pågår",
        completed: "Klar",
        failed: "Misslyckades",
        cancelled: "Avbruten",
        paused: "Pausad",
        anyDate: "Valfritt datum",
        d7: "7 dagar",
        d30: "30 dagar",
        d90: "90 dagar",
        results: "Resultat",
        newN: "Nya",
        seen: "Sedda tidigare",
        excluded: "Uteslutna",
        open: "Öppna",
        again: "Kör igen",
        dup: "Duplicera",
        unnamed: "Sökning",
      },
    },
    locale,
  );
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sinceDays, setSinceDays] = useState(0);
  const runs = useQuery({
    queryKey: ["search-history", q, status, sinceDays],
    queryFn: () => listRuns({ data: { q, status, sinceDays } }),
  });
  const rows = (runs.data?.runs ?? []) as RunRow[];

  async function rerun(row: RunRow) {
    if (!row.criteria) {
      toast.error(copy.noFilters);
      return;
    }
    try {
      const res = await startSearch({ data: { criteria: row.criteria, name: row.name ?? undefined } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      nav({ to: "/search/$runId", params: { runId: res.runId } });
    } catch {
      toast.error(copy.startFail);
    }
  }

  function duplicate(row: RunRow) {
    if (!row.criteria) {
      toast.error(copy.noFilters);
      return;
    }
    try {
      window.sessionStorage.setItem("norf-duplicate-criteria", JSON.stringify(row.criteria));
      if (row.name) window.sessionStorage.setItem("norf-duplicate-name", row.name);
    } catch {
      /* ignore */
    }
    nav({ to: "/search/new" });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="title">{copy.title}</h1>
          <p className="mt-1 text-sm text-mute">{copy.body}</p>
        </div>
        <Button onClick={() => nav({ to: "/search/new" })}>{ta("newSearch")}</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={copy.byName} className="max-w-xs" />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-line bg-panel px-3 py-2 text-sm"
          aria-label={copy.allStatus}
        >
          <option value="">{copy.allStatus}</option>
          <option value="running">{copy.running}</option>
          <option value="completed">{copy.completed}</option>
          <option value="failed">{copy.failed}</option>
          <option value="cancelled">{copy.cancelled}</option>
          <option value="paused">{copy.paused}</option>
        </select>
        <select
          value={String(sinceDays)}
          onChange={(e) => setSinceDays(Number(e.target.value) || 0)}
          className="border border-line bg-panel px-3 py-2 text-sm"
          aria-label={copy.anyDate}
        >
          <option value="0">{copy.anyDate}</option>
          <option value="7">{copy.d7}</option>
          <option value="30">{copy.d30}</option>
          <option value="90">{copy.d90}</option>
        </select>
      </div>
      {rows.length === 0 ? (
        <Empty title={copy.empty} body={copy.emptyBody} />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const stats = r.stats ?? {};
            const newN = r.new_leads_count ?? stats.discovered ?? 0;
            const seenN = r.previously_seen_count ?? 0;
            return (
              <article key={r.id} className="border border-line bg-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to="/search/$runId" params={{ runId: r.id }} className="font-medium hover:underline">
                      {asDisplay(r.name, copy.unnamed)}
                    </Link>
                    <p className="mt-1 text-xs text-mute">{formatWhen(r.created_at, "-", locale)}</p>
                    {r.criteria?.groups ? (
                      <p className="mt-2 text-sm text-mute">{describeCriteria(r.criteria)}</p>
                    ) : null}
                  </div>
                  <Pill tone={r.status === "completed" ? "good" : r.status === "failed" ? "bad" : "info"}>{asDisplay(r.status)}</Pill>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-mute">
                  <span>{copy.results} {asDisplay(stats.discovered ?? 0)}</span>
                  <span>{copy.newN} {asDisplay(newN)}</span>
                  <span>{copy.seen} {asDisplay(seenN)}</span>
                  {r.excluded_count ? <span>{copy.excluded} {asDisplay(r.excluded_count)}</span> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => nav({ to: "/search/$runId", params: { runId: r.id } })}>{copy.open}</Button>
                  <Button variant="secondary" onClick={() => void rerun(r)}>{copy.again}</Button>
                  <Button variant="secondary" onClick={() => duplicate(r)}>{copy.dup}</Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
