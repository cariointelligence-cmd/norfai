import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getBootstrap, confirmBilling } from "@/lib/norr/actions";
import { Empty, Pill, Stat } from "@/components/status";
import { ProgressRailPulse } from "@/components/progress-rail";
import { asDisplay, formatWhen } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";

export const Route = createFileRoute("/_app/overview")({ component: Dashboard });

function Dashboard() {
  const { locale, ta } = useI18n();
  const copy = loc(
    {
      fi: {
        title: "Yhteenveto",
        body: "Live-luvut tälle työtilalle. Tyhjä tarkoittaa, ettei vielä ole löydetty mitään.",
        companies: "Yritykset",
        companiesHint: "Virallisista rekistereistä ja yritysten sivuilta",
        people: "Päättäjät",
        peopleHint: "Julkaistu yrityksen sivuilla",
        contacts: "Yhteystiedot",
        contactsHint: "Julkaistut ja arvaillut, merkitty",
        sources: "Lähteet päällä",
        sourcesHint: "Avoimet lähteet. Kaupallisia avaimia ei tarvita.",
        runs: "Haut",
        jobs: "Työt käynnissä",
        review: "Avoin tarkistus",
        empty: "Ei yrityksiä tässä työtilassa",
        emptyBody: "Norf ei toimita demotilejä. Aloita haku. Viralliset rekisterit ja sivustot haetaan automaattisesti.",
        recentCompanies: "Viimeisimmät yritykset",
        recentRuns: "Viimeisimmät haut",
        live: "Haku käynnissä",
        liveHint: "Rekisterit, sivustot ja yhteystiedot kertyvät yleensä parissa minuutissa.",
        hive: "Viimeisin rekisteriyhteys",
        hiveNever: "Rekisteriä ei ole vielä kutsuttu tässä työtilassa.",
        loading: "Ladataan työpöytää",
      },
      en: {
        title: "Overview",
        body: "Live totals for this workspace. Empty means nothing has been found yet.",
        companies: "Companies",
        companiesHint: "From official registers and company sites",
        people: "People",
        peopleHint: "Published on company pages",
        contacts: "Contacts",
        contactsHint: "Published plus inferred, labelled",
        sources: "Sources online",
        sourcesHint: "Open sources. Commercial keys are not required.",
        runs: "Search runs",
        jobs: "Jobs in flight",
        review: "Open review",
        empty: "No companies in this workspace",
        emptyBody: "Norf does not ship demo accounts. Start a search. Official registers and company websites are queried automatically.",
        recentCompanies: "Recent companies",
        recentRuns: "Recent runs",
        live: "Search in progress",
        liveHint: "Registers, websites and contacts usually land within a few minutes.",
        hive: "Last register contact",
        hiveNever: "No register has been called in this workspace yet.",
        loading: "Loading the workspace",
      },
      sv: {
        title: "Översikt",
        body: "Live-siffror för arbetsytan. Tomt betyder att inget hittats ännu.",
        companies: "Bolag",
        companiesHint: "Från officiella register och bolagssajter",
        people: "Beslutsfattare",
        peopleHint: "Publicerade på bolagets sidor",
        contacts: "Kontakter",
        contactsHint: "Publicerade plus gissade, märkta",
        sources: "Källor online",
        sourcesHint: "Öppna källor. Kommersiella nycklar krävs inte.",
        runs: "Sökningar",
        jobs: "Jobb i gång",
        review: "Öppen granskning",
        empty: "Inga bolag i arbetsytan",
        emptyBody: "Norf skickar inte demokonton. Starta en sökning. Officiella register och sajter frågas automatiskt.",
        recentCompanies: "Senaste bolag",
        recentRuns: "Senaste sökningar",
        live: "Sökning pågår",
        liveHint: "Register, sajter och kontakter landar vanligtvis inom några minuter.",
        hive: "Senaste registerkontakt",
        hiveNever: "Inget register har anropats i arbetsytan ännu.",
        loading: "Laddar arbetsytan",
      },
    },
    locale,
  );
  const q = useQuery({ queryKey: ["bootstrap"], queryFn: () => getBootstrap(), retry: 0 });
  const qc = useQueryClient();
  const billingFlag = useRouterState({ select: (s) => s.location.searchStr.includes("billing=success") });
  useEffect(() => {
    if (!billingFlag) return;
    void confirmBilling().then(() => {
      void qc.invalidateQueries({ queryKey: ["bootstrap"] });
    });
  }, [billingFlag, qc]);
  const d = q.data;
  if (q.isError) {
    return (
      <div className="text-sm text-mute">
        {ta("workspaceTimeout")}{" "}
        <button type="button" className="underline" onClick={() => void q.refetch()}>{ta("retry")}</button>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="space-y-6">
        <ProgressRailPulse label={copy.loading} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="panel p-4 space-y-3">
              <div className="skel w-16" />
              <div className="skel h-7 w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  const empty = d.counts.companies === 0;
  const jobsLive = Number(d.counts.jobsRunning ?? 0) > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="title">{copy.title}</h1>
          <p className="mt-2 max-w-xl text-sm text-mute">{copy.body}</p>
        </div>
        <Link to="/search/new" className="cta">
          {ta("newSearch")}
        </Link>
      </div>
      {billingFlag ? (
        <p className="panel px-3 py-2 text-sm">
          {d.plan && d.plan !== "free"
            ? `Maksu vahvistettu. Käytössä ${String(d.plan)}.`
            : "Maksu vastaanotettu. Vahvistetaan Stripesta."}
        </p>
      ) : null}
      {!d.isAdmin && d.plan === "free" && d.searchesLimit > 0 && d.searchesUsed >= d.searchesLimit ? (
        <p className="border border-line bg-panel px-3 py-2 text-sm">
          Hakukiintiö täynnä tälle jaksolle. Löydetyt yritykset säilyvät.{" "}
          <Link to="/billing" className="underline">Avaa tilaus</Link>
          {" · "}
          <Link to="/tickets" className="underline">Palaute</Link>
        </p>
      ) : !d.isAdmin && d.plan === "free" && d.searchesLimit > 0 && d.searchesUsed >= Math.ceil(d.searchesLimit * 0.8) ? (
        <p className="border border-line bg-panel px-3 py-2 text-sm">
          Suurin osa hauista on käytetty ({d.searchesUsed}/{d.searchesLimit}).{" "}
          <Link to="/billing" className="underline">Katso tilaus</Link>
        </p>
      ) : null}
      {jobsLive ? (
        <div className="panel p-4">
          <ProgressRailPulse label={`${copy.live} · ${d.counts.jobsRunning}`} />
          <p className="mt-2 text-xs text-mute">{copy.liveHint}</p>
        </div>
      ) : (
        <div className="border border-line bg-panel px-4 py-3">
          <p className="kicker">{copy.hive}</p>
          <p className="mt-1 text-sm">
            {d.hive?.sourceId
              ? `${d.hive.sourceId}${d.hive.lastLatencyMs != null ? ` · ${d.hive.lastLatencyMs} ms` : ""}`
              : copy.hiveNever}
          </p>
          {d.hive?.lastSuccessAt ? (
            <p className="mt-1 text-xs text-mute">{formatWhen(d.hive.lastSuccessAt, "-", locale)}</p>
          ) : null}
        </div>
      )}
      {billingFlag ? (
        <p className="border border-line bg-panel px-3 py-2 text-sm">
          Maksu vastaanotettu. Suunnitelma päivittyy, kun Stripe vahvistaa tilauksen.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={copy.companies} value={d.counts.companies} hint={copy.companiesHint} />
        <Stat label={copy.people} value={d.counts.people} hint={copy.peopleHint} />
        <Stat label={copy.contacts} value={d.counts.contacts} hint={copy.contactsHint} />
        <Stat label={copy.sources} value={`${d.counts.sourcesConnected}/${d.counts.sourcesTotal}`} hint={copy.sourcesHint} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={copy.runs} value={d.counts.runs} />
        <Stat label={copy.jobs} value={d.counts.jobsRunning} />
        <Stat label={copy.review} value={d.counts.openReview} />
      </div>
      {empty ? (
        <Empty
          title={copy.empty}
          body={copy.emptyBody}
            action={
              <Link to="/search/new" className="cta-ghost">
                {ta("newSearch")}
              </Link>
            }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-medium">{copy.recentCompanies}</h2>
            <div className="border border-line">
              {d.recentCompanies.map((c: any) => (
                <Link key={c.id} to="/companies/$companyId" params={{ companyId: c.id }} className="flex items-center justify-between border-b border-line px-3 py-2 last:border-0 hover:bg-panel-2">
                  <div>
                    <div className="text-sm">{asDisplay(c.name)}</div>
                    <div className="text-xs text-mute">{[c.municipality, c.industry_label].filter(Boolean).join(" · ") || "-"}</div>
                  </div>
                  <Pill tone={c.record_status === "verified" ? "good" : c.record_status === "rejected" ? "bad" : "mute"}>{asDisplay(c.record_status)}</Pill>
                </Link>
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-sm font-medium">{copy.recentRuns}</h2>
            <div className="border border-line">
              {d.recentRuns.map((r: any) => (
                <Link key={r.id} to="/search/$runId" params={{ runId: r.id }} className="flex items-center justify-between border-b border-line px-3 py-2 last:border-0 hover:bg-panel-2">
                  <div className="font-mono text-xs text-mute">{asDisplay(r.id).slice(0, 8)}</div>
                  <Pill>{asDisplay(r.status)}</Pill>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
