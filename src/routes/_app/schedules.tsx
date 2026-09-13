import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listProfiles } from "@/lib/norr/actions";
import { Empty, Pill } from "@/components/status";
import { formatWhen, asDisplay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";

export const Route = createFileRoute("/_app/schedules")({ component: Schedules });

function Schedules() {
  const { locale } = useI18n();
  const copy = loc(
    {
      fi: {
        title: "Ajastetut haut",
        body: "Erääntyvät ajastukset käynnistyvät, kun työtila on auki. Päivittäinen toisto on valmis tahti.",
        empty: "Ei ajastuksia",
        emptyBody: "Ota ajastus käyttöön, kun tallennat profiilin. Ajastettu haku lisää vain uudet tai muuttuneet tiedot.",
        next: "seuraava",
        last: "edellinen",
        never: "ei vielä",
        daily: "päivittäin",
      },
      en: {
        title: "Scheduled searches",
        body: "Due schedules fire when the workspace is open (and on each job tick). Recurring daily is the built-in cadence.",
        empty: "Nothing scheduled",
        emptyBody: "Enable a schedule when saving a profile. Scheduled runs only persist new or materially changed records.",
        next: "next",
        last: "last",
        never: "never",
        daily: "daily",
      },
      sv: {
        title: "Schemalagda sökningar",
        body: "Förfallna scheman körs när arbetsytan är öppen. Daglig upprepning är inbyggd.",
        empty: "Inget schemalagt",
        emptyBody: "Aktivera schema när du sparar en profil. Schemalagda körningar sparar bara nytt eller ändrat.",
        next: "nästa",
        last: "senast",
        never: "aldrig",
        daily: "dagligen",
      },
    },
    locale,
  );
  const q = useQuery({ queryKey: ["profiles"], queryFn: () => listProfiles() });
  const rows = (q.data?.profiles ?? []) as Array<{ id: string; name: string; schedule_enabled: boolean; next_run_at: string | null; last_run_at: string | null; schedule_cron: string | null }>;
  const scheduled = rows.filter((r) => r.schedule_enabled);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium tracking-tight">{copy.title}</h1>
      <p className="text-sm text-mute">{copy.body}</p>
      {scheduled.length === 0 ? (
        <Empty title={copy.empty} body={copy.emptyBody} />
      ) : (
        <div className="border border-line">
          {scheduled.map((s) => (
            <div key={s.id} className="flex justify-between border-b border-line px-3 py-3 text-sm last:border-0">
              <div>
                <div>{asDisplay(s.name)}</div>
                <div className="text-xs text-mute">{copy.next} {formatWhen(s.next_run_at, "-", locale)} · {copy.last} {formatWhen(s.last_run_at, copy.never, locale)}</div>
              </div>
              <Pill tone="info">{asDisplay(s.schedule_cron, copy.daily)}</Pill>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
