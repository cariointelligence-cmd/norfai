import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listReview, resolveReview, scanDuplicates } from "@/lib/norr/actions";
import { Button } from "@/components/ui/button";
import { Empty, Pill } from "@/components/status";
import { asDisplay, formatWhen } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/review")({ component: Review });

type Payload = {
  a?: string;
  b?: string;
  aName?: string;
  bName?: string;
  action?: string;
  reason?: string;
  confidence?: number;
  field?: string;
  value?: string;
  claim?: string;
  evidence?: string;
};

function Review() {
  const { locale, ta } = useI18n();
  const copy = loc(
    {
      fi: {
        title: "Tarkistusjono",
        body: "Epävarmat yhdistämiset ja matalan luottamuksen väitteet. Alle kynnyksen ei yhdistetä automaattisesti.",
        empty: "Jono on tyhjä",
        emptyBody: "Aja kaksoiskappalehaku tältä sivulta.",
        merge: "Mahdollinen kaksoiskappale",
        claim: "Matalan luottamuksen väite",
        keepA: "Pidä ensimmäinen, yhdistä toinen",
        keepB: "Pidä toinen, yhdistä ensimmäinen",
        vs: "vai",
        confidence: "Luottamus",
        why: "Miksi",
        openCompany: "Avaa",
      },
      en: {
        title: "Review queue",
        body: "Uncertain merges and low-confidence claims. Nothing is auto-merged below the safe threshold.",
        empty: "Queue is empty",
        emptyBody: "Run a duplicate scan on this page to populate merge candidates.",
        merge: "Possible duplicate",
        claim: "Low-confidence claim",
        keepA: "Keep the first, merge the second",
        keepB: "Keep the second, merge the first",
        vs: "or",
        confidence: "Confidence",
        why: "Why",
        openCompany: "Open",
      },
      sv: {
        title: "Granskningskö",
        body: "Osäkra sammanslagningar och påståenden med låg tillförlitlighet. Inget slås ihop automatiskt under tröskeln.",
        empty: "Kön är tom",
        emptyBody: "Kör en dubblettskanning här.",
        merge: "Möjlig dubblett",
        claim: "Påstående med låg tillförlitlighet",
        keepA: "Behåll den första, slå ihop den andra",
        keepB: "Behåll den andra, slå ihop den första",
        vs: "eller",
        confidence: "Tillförlitlighet",
        why: "Varför",
        openCompany: "Öppna",
      },
    },
    locale,
  );
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["review"], queryFn: () => listReview() });
  const scan = useMutation({
    mutationFn: () => scanDuplicates(),
    onSuccess: (r) => {
      toast.message(`${r.created ?? 0} candidate pairs`);
      void qc.invalidateQueries({ queryKey: ["review"] });
    },
  });
  const items = (q.data?.items ?? []) as Array<{ id: string; kind: string; status: string; payload: Payload; created_at?: string }>;
  const open = items.filter((i) => i.status === "open");

  async function decide(id: string, status: "accepted" | "rejected", keepId?: string, dropId?: string) {
    const r = await resolveReview({ data: { id, status, keepId, dropId } });
    if (!r.ok) toast.error(r.error ?? "Failed");
    void qc.invalidateQueries({ queryKey: ["review"] });
    void qc.invalidateQueries({ queryKey: ["bootstrap"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">{copy.title}</h1>
          <p className="text-sm text-mute">{copy.body}</p>
        </div>
        <Button
          variant="secondary"
          disabled={scan.isPending}
          onClick={() => scan.mutate()}
        >
          {scan.isPending ? "…" : locale === "fi" ? "Etsi kaksoiskappaleet" : locale === "sv" ? "Skanna dubbletter" : "Scan duplicates"}
        </Button>
      </div>
      {open.length === 0 ? <Empty title={copy.empty} body={copy.emptyBody} /> : open.map((i) => {
        const p = i.payload ?? {};
        const isDup = i.kind === "duplicate" && p.a && p.b;
        const conf = typeof p.confidence === "number" ? Math.round(p.confidence) : null;
        return (
          <div key={i.id} className="border border-line bg-panel p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Pill>{isDup ? copy.merge : copy.claim}</Pill>
              {conf != null ? <Pill tone="info">{copy.confidence} {conf}</Pill> : null}
              <span className="text-xs text-mute">{formatWhen(i.created_at, "", locale)}</span>
            </div>
            {isDup ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <div className="border border-line p-3">
                  <div className="text-sm font-medium">{asDisplay(p.aName, p.a)}</div>
                  {p.a ? <Link className="mt-1 inline-block text-xs text-mute hover:underline" to="/companies/$companyId" params={{ companyId: p.a }}>{copy.openCompany}</Link> : null}
                </div>
                <div className="self-center text-xs uppercase tracking-[0.14em] text-faint">{copy.vs}</div>
                <div className="border border-line p-3">
                  <div className="text-sm font-medium">{asDisplay(p.bName, p.b)}</div>
                  {p.b ? <Link className="mt-1 inline-block text-xs text-mute hover:underline" to="/companies/$companyId" params={{ companyId: p.b }}>{copy.openCompany}</Link> : null}
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                {p.field ? <div>{asDisplay(p.field)}{p.value ? `: ${asDisplay(p.value)}` : ""}</div> : null}
                {p.claim ? <div>{asDisplay(p.claim)}</div> : null}
                {p.aName ? <div>{asDisplay(p.aName)}</div> : null}
              </div>
            )}
            {p.reason || p.evidence ? (
              <p className="mt-3 text-xs text-mute">{copy.why}: {asDisplay(p.reason || p.evidence)}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {isDup ? (
                <>
                  <Button size="sm" onClick={() => void decide(i.id, "accepted", p.a, p.b)}>{copy.keepA}</Button>
                  <Button size="sm" variant="secondary" onClick={() => void decide(i.id, "accepted", p.b, p.a)}>{copy.keepB}</Button>
                </>
              ) : (
                <Button size="sm" onClick={() => void decide(i.id, "accepted")}>{ta("accept")}</Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => void decide(i.id, "rejected")}>{ta("reject")}</Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
