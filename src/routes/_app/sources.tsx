import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getNetworkSnapshot } from "@/lib/norr/actions";
import { SourceStatePill, Stat } from "@/components/status";
import { formatWhen } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";

export const Route = createFileRoute("/_app/sources")({ component: Sources });

function Sources() {
  const { locale } = useI18n();
  const copy = loc(
    {
      fi: {
        title: "Mistä data tulee",
        body: "Norf lukee viralliset rekisterit ja yritysten omat sivut. Tila on viimeisin oikea yhteys, ei tarra.",
        path: "Live-polku",
        generated: "Tilanne",
        last: "Viimeisin rekisteriyhteys",
        never: "Ei vielä osumaa tälle työtilalle. Aja haku.",
        live: "lähdettä linjassa",
        off: "Pois",
      },
      en: {
        title: "Where the data comes from",
        body: "Norf reads official registers and company-controlled sites. Status is the last real contact, not a sticker.",
        path: "Live path",
        generated: "Snapshot",
        last: "Last register contact",
        never: "No hit for this workspace yet. Run a search.",
        live: "sources in line",
        off: "Off",
      },
      sv: {
        title: "Var datan kommer ifrån",
        body: "Norf läser officiella register och bolagens egna sajter. Status är senaste riktiga kontakt.",
        path: "Live-väg",
        generated: "Ögonblick",
        last: "Senaste registerkontakt",
        never: "Ingen träff ännu. Kör en sökning.",
        live: "källor i linje",
        off: "Av",
      },
    },
    locale,
  );
  const q = useQuery({
    queryKey: ["network"],
    queryFn: () => getNetworkSnapshot(),
    refetchInterval: 8000,
  });
  const engines = q.data?.engines ?? [];
  const core = engines.filter((e: { core?: boolean }) => e.core);
  const last = q.data?.last as { sourceId?: string; lastSuccessAt?: string | null; lastLatencyMs?: number | null } | null;
  const path = q.data?.livePath as { sensor?: string; memory?: string; cortex?: string; face?: string } | null;
  const onlineCore = core.filter((e: { status?: string }) => e.status === "connected").length;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="title">{copy.title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-mute">{copy.body}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label={copy.path}
          value={path ? `${path.sensor} → ${path.cortex}` : "ytj → score"}
          hint={path ? `${path.memory} · ${path.face}` : undefined}
        />
        <Stat
          label={copy.last}
          value={last?.sourceId ?? copy.never}
          hint={
            last?.lastSuccessAt
              ? `${formatWhen(last.lastSuccessAt, "-", locale)}${last.lastLatencyMs != null ? ` · ${last.lastLatencyMs} ms` : ""}`
              : copy.never
          }
        />
        <Stat
          label={copy.generated}
          value={`${onlineCore}/${core.length}`}
          hint={q.data?.generatedAt ? formatWhen(q.data.generatedAt, "-", locale) : copy.live}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {core.map((engine: any) => (
          <article key={engine.id} className="border border-line bg-panel p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">{engine.label}</h2>
              <SourceStatePill state={engine.status} />
            </div>
            <p className="text-xs text-mute">{engine.blurb}</p>
            <p className="mt-3 font-mono text-xs text-faint">
              {engine.online}/{engine.total} {copy.live}
            </p>
            <ul className="mt-3 space-y-1">
              {(engine.sources ?? []).map((s: any) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className={s.enabled === false ? "text-faint" : ""}>{s.name}</span>
                  <span className="shrink-0 font-mono text-faint">
                    {s.enabled === false
                      ? copy.off
                      : s.lastLatencyMs != null
                        ? `${s.lastLatencyMs} ms`
                        : s.lastSuccessAt
                          ? formatWhen(s.lastSuccessAt, "-", locale)
                          : s.countries?.join(" ")}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
