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
        construction: "Sivusto ja järjestelmät ovat rakenteilla 16.9.2026 asti. Pahoittelemme mahdollista haittaa.",
        payOk: "Maksu vahvistettu. Käytössä {plan}.",
        payPending: "Maksu vastaanotettu. Vahvistetaan Stripesta.",
        quotaFull: "Hakukiintiö täynnä tälle jaksolle. Löydetyt yritykset säilyvät.",
        quotaWarn: "Suurin osa hauista on käytetty ({used}/{limit}).",
        openBilling: "Avaa tilaus",
        seeBilling: "Katso tilaus",
        feedback: "Palaute",
        stripeWait: "Maksu vastaanotettu. Suunnitelma päivittyy, kun Stripe vahvistaa tilauksen.",
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
        construction: "The site and systems are under construction until 16 September 2026. Please excuse us for possible inconvenience.",
        payOk: "Payment confirmed. You are on {plan}.",
        payPending: "Payment received. Confirming with Stripe.",
        quotaFull: "Search quota is used for this period. Found companies are kept.",
        quotaWarn: "Most of this period’s searches are used ({used}/{limit}).",
        openBilling: "Open billing",
        seeBilling: "See plan",
        feedback: "Feedback",
        stripeWait: "Payment received. The plan updates when Stripe confirms the subscription.",
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
        construction: "Webbplatsen och systemen är under uppbyggnad till den 16 september 2026. Ursäkta eventuell olägenhet.",
        payOk: "Betalning bekräftad. Du har {plan}.",
        payPending: "Betalning mottagen. Bekräftas med Stripe.",
        quotaFull: "Sökkvoten är fylld för perioden. Hittade bolag behålls.",
        quotaWarn: "Större delen av sökningarna är använda ({used}/{limit}).",
        openBilling: "Öppna abonnemang",
        seeBilling: "Se plan",
        feedback: "Feedback",
        stripeWait: "Betalning mottagen. Planen uppdateras när Stripe bekräftar abonnemanget.",
      },
    },
    locale,
  );
  const q = useQuery({
    queryKey: ["bootstrap"],
    queryFn: async () => {
      const r = await fetch("/api/workspace/boot", { credentials: "include", headers: { accept: "application/json" } });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "boot failed");
      return j;
    },
    retry: 1,
    staleTime: 8_000,
  });
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
      <div className="text-sm text-mute">{ta("contactSupport")}</div>
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
      <div className="border border-line bg-panel px-4 py-3 text-sm">
        {copy.construction}
      </div>
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
            ? copy.payOk.replace("{plan}", String(d.plan))
            : copy.payPending}
        </p>
      ) : null}
      {!d.isAdmin && d.plan === "free" && d.searchesLimit > 0 && d.searchesUsed >= d.searchesLimit ? (
        <p className="border border-line bg-panel px-3 py-2 text-sm">
          {copy.quotaFull}{" "}
          <Link to="/billing" className="underline">{copy.openBilling}</Link>
          {" · "}
          <Link to="/tickets" className="underline">{copy.feedback}</Link>
        </p>
      ) : !d.isAdmin && d.plan === "free" && d.searchesLimit > 0 && d.searchesUsed >= Math.ceil(d.searchesLimit * 0.8) ? (
        <p className="border border-line bg-panel px-3 py-2 text-sm">
          {copy.quotaWarn.replace("{used}", String(d.searchesUsed)).replace("{limit}", String(d.searchesLimit))}{" "}
          <Link to="/billing" className="underline">{copy.seeBilling}</Link>
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
          {copy.stripeWait}
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
              {d.recentCompanies.length === 0 ? (
                <Empty title={copy.recentCompanies} body="-" />
              ) : d.recentCompanies.map((c: any) => (
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
              {d.recentRuns.length === 0 ? (
                <Empty title={copy.recentRuns} body="-" />
              ) : d.recentRuns.map((r: any) => (
                <Link key={r.id} to="/search/$runId" params={{ runId: r.id }} className="flex items-center justify-between border-b border-line px-3 py-2 last:border-0 hover:bg-panel-2">
                  <div>
                    <div className="text-sm">{asDisplay(r.name) || asDisplay(r.id).slice(0, 8)}</div>
                    <div className="font-mono text-xs text-mute">{formatWhen(r.created_at)}{r.new_leads_count != null ? ` · ${r.new_leads_count}` : ""}</div>
                  </div>
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
