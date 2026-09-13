import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listChanges, markChangesRead, rebuildDigest } from "@/lib/norr/ops-actions";
import { Button } from "@/components/ui/button";
import { Empty, Pill } from "@/components/status";
import { formatWhen } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/changes")({ component: Changes });

function Changes() {
  const { locale } = useI18n();
  const copy = loc(
    {
      fi: {
        title: "Muutokset",
        body: "Vertailu perustuu tallennettuihin tilannekuviin. Tapahtumia ei keksitä. Viikkokooste syntyy, kun yrityksiä päivitetään.",
        mark: "Merkitse luetuiksi",
        rebuild: "Rakenna viikkokooste",
        empty: "Ei muutoksia",
        emptyBody: "Muutokset ilmestyvät, kun yrityksen sivu, päättäjä, puhelin, sähköposti tai julkaistu tulos muuttuu päivityksen jälkeen.",
        digest: "Viikkokooste",
        unread: "Lukematon",
      },
      en: {
        title: "Changes",
        body: "Compared from stored snapshots. Events are never invented. The weekly digest appears after companies are refreshed.",
        mark: "Mark as read",
        rebuild: "Build weekly digest",
        empty: "No changes",
        emptyBody: "Changes appear when a company website, decision-maker, phone, email or published result changes after a refresh.",
        digest: "Weekly digest",
        unread: "Unread",
      },
      sv: {
        title: "Ändringar",
        body: "Jämförs mot sparade ögonblicksbilder. Händelser hittas inte på. Veckosammanfattningen kommer efter att bolag uppdaterats.",
        mark: "Markera som lästa",
        rebuild: "Bygg veckosammanfattning",
        empty: "Inga ändringar",
        emptyBody: "Ändringar syns när sajt, beslutsfattare, telefon, e-post eller publicerat resultat ändras efter en uppdatering.",
        digest: "Veckosammanfattning",
        unread: "Oläst",
      },
    },
    locale,
  );
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["changes"], queryFn: () => listChanges() });
  const mark = useMutation({
    mutationFn: () => markChangesRead(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["changes"] });
      toast.message(copy.mark);
    },
  });
  const digest = useMutation({
    mutationFn: () => rebuildDigest(),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["changes"] });
      if (!r.ok) toast.error(r.error ?? copy.empty);
      else toast.message(r.digest?.headline ?? copy.digest);
    },
  });
  const rows = q.data?.changes ?? [];
  const payload = q.data?.digest?.payload && typeof q.data.digest.payload === "object" ? q.data.digest.payload : null;
  const headline = payload && typeof (payload as { headline?: unknown }).headline === "string" ? (payload as { headline: string }).headline : null;
  const items = payload && Array.isArray((payload as { items?: unknown }).items) ? (payload as { items: Array<{ companyId?: string; name?: string; summary?: string }> }).items : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">{copy.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-mute">{copy.body}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => digest.mutate()} disabled={digest.isPending}>
            {copy.rebuild}
          </Button>
          <Button size="sm" onClick={() => mark.mutate()} disabled={mark.isPending || rows.length === 0}>
            {copy.mark}
          </Button>
        </div>
      </div>
      {headline ? (
        <section className="border border-line bg-panel p-4">
          <div className="kicker">{copy.digest}</div>
          <p className="mt-2 text-sm font-medium">{headline}</p>
          {items.length ? (
            <ul className="mt-3 space-y-1 text-sm text-mute">
              {items.slice(0, 12).map((it, i) => (
                <li key={`${it.companyId ?? "x"}-${i}`}>
                  {it.companyId ? (
                    <Link className="hover:underline" to="/companies/$companyId" params={{ companyId: String(it.companyId) }}>
                      {it.name ?? "Company"}
                    </Link>
                  ) : (
                    <span>{it.name ?? "Company"}</span>
                  )}
                  {": "}
                  {it.summary}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {rows.length === 0 ? (
        <Empty title={copy.empty} body={copy.emptyBody} />
      ) : (
        <div className="border border-line">
          {rows.map((r: { id: string; company_id: string; name: string; summary: string; severity: string; detected_at: string; read_at: string | null }) => (
            <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-3 py-3 last:border-0">
              <div className="min-w-0">
                <Link className="text-sm font-medium hover:underline" to="/companies/$companyId" params={{ companyId: r.company_id }}>
                  {r.name}
                </Link>
                <p className="mt-1 text-sm text-mute">{r.summary}</p>
                <p className="mt-1 text-xs text-faint">{formatWhen(r.detected_at, "-", locale)}</p>
              </div>
              <div className="flex items-center gap-2">
                {r.read_at ? null : <Pill tone="info">{copy.unread}</Pill>}
                <Pill tone={r.severity === "high" ? "warn" : "mute"}>{r.severity}</Pill>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
