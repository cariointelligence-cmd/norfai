import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { importExclusions, listExclusions, removeExclusion } from "@/lib/norr/ops-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Empty, Pill } from "@/components/status";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/accounts")({ component: Accounts });

function Accounts() {
  const { locale, ta } = useI18n();
  const copy = loc(
    {
      fi: {
        title: "Asiakkaat ja esto",
        body: "Liitä Y-tunnuksia, verkkotunnuksia tai nimiä. Nämä jätetään pois uusista hauista, ei vain viennistä.",
        paste: "Yksi rivi per yritys. Esim. 0112038-9, asiakas.fi tai Asiakas Oy",
        import: "Lisää listaan",
        empty: "Ei poissuljettuja",
        emptyBody: "Haku ei vielä jätä ketään pois. Liitä nykyiset asiakkaat tai kieltolistat.",
        added: "Lisätty",
        none: "Ei kelvollisia rivejä",
      },
      en: {
        title: "Customers and blocklist",
        body: "Paste business IDs, domains or names. They are excluded from new searches, not just from export.",
        paste: "One company per line. Example: 0112038-9, customer.fi or Customer Ltd",
        import: "Add to list",
        empty: "Nothing excluded",
        emptyBody: "Search does not skip anyone yet. Paste current customers or a do-not-contact list.",
        added: "Added",
        none: "No valid rows",
      },
      sv: {
        title: "Kunder och blockering",
        body: "Klistra in FO-nummer, domäner eller namn. De utesluts från nya sökningar, inte bara export.",
        paste: "Ett bolag per rad. T.ex. 0112038-9, kund.fi eller Kund Ab",
        import: "Lägg till",
        empty: "Inget uteslutet",
        emptyBody: "Sökningen hoppar inte över någon ännu. Klistra in kunder eller en spärrlista.",
        added: "Tillagda",
        none: "Inga giltiga rader",
      },
    },
    locale,
  );
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const q = useQuery({ queryKey: ["exclusions"], queryFn: () => listExclusions() });
  const add = useMutation({
    mutationFn: () => importExclusions({ data: { text } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["exclusions"] });
      if (!r.ok) {
        toast.error(r.error ?? copy.none);
        return;
      }
      setText("");
      toast.message(`${copy.added} ${r.added}`);
    },
  });
  const rows = q.data?.rows ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">{copy.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">{copy.body}</p>
      </div>
      <form
        className="space-y-3 border border-line bg-panel p-4"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={copy.paste} required />
        <Button type="submit" disabled={add.isPending || !text.trim()}>
          {copy.import}
        </Button>
      </form>
      {rows.length === 0 ? (
        <Empty title={copy.empty} body={copy.emptyBody} />
      ) : (
        <div className="border border-line">
          {rows.map((r: { id: string; kind: string; value: string; label?: string | null }) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 last:border-0">
              <div className="min-w-0">
                <div className="font-mono text-sm">{r.value}</div>
                {r.label ? <div className="text-xs text-mute">{r.label}</div> : null}
              </div>
              <div className="flex items-center gap-2">
                <Pill>{r.kind}</Pill>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void removeExclusion({ data: { id: r.id } }).then(() => void qc.invalidateQueries({ queryKey: ["exclusions"] }));
                  }}
                >
                  {ta("remove")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
