import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listAudit } from "@/lib/norr/actions";
import { Empty } from "@/components/status";
import { formatWhen, asDisplay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";

export const Route = createFileRoute("/_app/audit")({ component: Audit });

function Audit() {
  const { locale } = useI18n();
  const copy = loc(
    {
      fi: { title: "Tapahtumaloki", empty: "Ei tapahtumia", body: "Haut, viennit, testit ja poistot kirjataan tähän." },
      en: { title: "Audit log", empty: "No events", body: "Searches, exports, tests and deletions are recorded here." },
      sv: { title: "Händelselogg", empty: "Inga händelser", body: "Sökningar, export, tester och raderingar loggas här." },
    },
    locale,
  );
  const q = useQuery({ queryKey: ["audit"], queryFn: () => listAudit() });
  const rows = (q.data?.events ?? []) as Array<{ id: string; action: string; entity_type: string | null; entity_id: string | null; created_at: string }>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium tracking-tight">{copy.title}</h1>
      {rows.length === 0 ? <Empty title={copy.empty} body={copy.body} /> : (
        <div className="border border-line">
          {rows.map((e) => (
            <div key={e.id} className="grid grid-cols-[160px_1fr_1fr] gap-2 border-b border-line px-3 py-2 text-xs last:border-0">
              <span className="font-mono text-mute">{formatWhen(e.created_at, "-", locale)}</span>
              <span>{asDisplay(e.action)}</span>
              <span className="truncate text-mute">{asDisplay(e.entity_type)} {asDisplay(e.entity_id)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
