import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { buildExport, listExports, listLists, listRuns } from "@/lib/norr/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Empty } from "@/components/status";
import { toast } from "sonner";
import { useState } from "react";
import { formatWhen, asDisplay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";

export const Route = createFileRoute("/_app/exports")({ component: Exports });

function download(filename: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function Exports() {
  const { locale } = useI18n();
  const copy = loc(
    {
      fi: {
        title: "Vienti",
        body: "Valitse lähde, rivimäärä ja muoto. Kaavat suojataan. Arvailut sähköpostit ovat omassa sarakkeessaan.",
        source: "Mistä viedään",
        all: "Kaikki yritykset työtilassa",
        run: "Yksi haku",
        list: "Yksi lista",
        pickRun: "Valitse haku",
        pickList: "Valitse lista",
        amount: "Montako yritystä",
        custom: "Oma määrä",
        columns: "Sarakkeet",
        full: "Kaikki sarakkeet",
        basic: "Perus",
        sales: "Myynti",
        financial: "Talous",
        marketing: "Markkinointi",
        empty: "Ei vientejä vielä",
        emptyBody: "Luo tiedosto nykyisestä yritystaulusta tai yhdestä hausta.",
        unnamed: "Haku",
      },
      en: {
        title: "Export centre",
        body: "Pick a source, how many companies, and a file format. Formula injection is escaped. Inferred emails stay in their own column.",
        source: "What to export",
        all: "All companies in this workspace",
        run: "One previous search",
        list: "One list",
        pickRun: "Choose a search",
        pickList: "Choose a list",
        amount: "How many companies",
        custom: "Custom amount",
        columns: "Columns",
        full: "Full columns",
        basic: "Basic",
        sales: "Sales",
        financial: "Financial",
        marketing: "Marketing",
        empty: "No exports yet",
        emptyBody: "Generate a file from the current company table or from one search.",
        unnamed: "Search",
      },
      sv: {
        title: "Export",
        body: "Välj källa, antal bolag och filformat. Formler skyddas. Gissade e-postadresser ligger i en egen kolumn.",
        source: "Vad ska exporteras",
        all: "Alla bolag i arbetsytan",
        run: "En tidigare sökning",
        list: "En lista",
        pickRun: "Välj sökning",
        pickList: "Välj lista",
        amount: "Hur många bolag",
        custom: "Eget antal",
        columns: "Kolumner",
        full: "Alla kolumner",
        basic: "Grund",
        sales: "Sälj",
        financial: "Ekonomi",
        marketing: "Marknadsföring",
        empty: "Inga exporter ännu",
        emptyBody: "Skapa en fil från bolagstabellen eller från en sökning.",
        unnamed: "Sökning",
      },
    },
    locale,
  );
  const q = useQuery({ queryKey: ["exports"], queryFn: () => listExports() });
  const runs = useQuery({ queryKey: ["runs-export"], queryFn: () => listRuns({ data: {} }) });
  const lists = useQuery({ queryKey: ["lists-export"], queryFn: () => listLists() });
  const [preset, setPreset] = useState("full");
  const [source, setSource] = useState<"all" | "run" | "list">("all");
  const [runId, setRunId] = useState("");
  const [listId, setListId] = useState("");
  const [limit, setLimit] = useState(50);
  const run = useMutation({
    mutationFn: (format: "csv" | "xlsx" | "json" | "crm") =>
      buildExport({
        data: {
          format,
          includeProvenance: true,
          scope: source,
          preset,
          limit,
          runId: source === "run" ? runId : undefined,
          listId: source === "list" ? listId : undefined,
        },
      }),
    onSuccess: (r) => {
      if (r.error) {
        toast.error(r.error);
        return;
      }
      download(r.filename, r.mime, r.body);
      toast.message(`${r.rowCount}`);
      void q.refetch();
    },
  });
  const rows = (q.data?.rows ?? []) as Array<{ id: string; format: string; filename: string; row_count: number; created_at: string; scope: string; run_id?: string | null }>;
  const runRows = (runs.data?.runs ?? []) as Array<{ id: string; name?: string | null }>;
  const listRows = lists.data?.lists ?? [];
  const canGo = source === "all" || (source === "run" && Boolean(runId)) || (source === "list" && Boolean(listId));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium tracking-tight">{copy.title}</h1>
      <p className="text-sm text-mute">{copy.body}</p>
      <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
        <Field label={copy.source}>
          <Select value={source} onChange={(e) => setSource(e.target.value as "all" | "run" | "list")}>
            <option value="all">{copy.all}</option>
            <option value="run">{copy.run}</option>
            <option value="list">{copy.list}</option>
          </Select>
        </Field>
        <Field label={copy.amount}>
          <Select value={String(limit)} onChange={(e) => setLimit(Number(e.target.value) || 50)}>
            {[10, 25, 50, 100, 250, 500].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </Field>
        {source === "run" ? (
          <Field label={copy.pickRun}>
            <Select value={runId} onChange={(e) => setRunId(e.target.value)}>
              <option value="">{copy.pickRun}</option>
              {runRows.map((r) => (
                <option key={r.id} value={r.id}>{asDisplay(r.name, copy.unnamed)}</option>
              ))}
            </Select>
          </Field>
        ) : null}
        {source === "list" ? (
          <Field label={copy.pickList}>
            <Select value={listId} onChange={(e) => setListId(e.target.value)}>
              <option value="">{copy.pickList}</option>
              {listRows.map((l: any) => (
                <option key={l.id} value={l.id}>{asDisplay(l.name)}</option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label={copy.columns}>
          <Select value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="full">{copy.full}</option>
            <option value="basic">{copy.basic}</option>
            <option value="sales">{copy.sales}</option>
            <option value="financial">{copy.financial}</option>
            <option value="marketing">{copy.marketing}</option>
          </Select>
        </Field>
        <Field label={copy.custom}>
          <Input type="number" min={1} max={2000} value={limit} onChange={(e) => setLimit(Math.max(1, Math.min(2000, Number(e.target.value) || 1)))} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run.mutate("csv")} disabled={run.isPending || !canGo}>CSV</Button>
        <Button variant="secondary" onClick={() => run.mutate("xlsx")} disabled={run.isPending || !canGo}>Excel</Button>
        <Button variant="secondary" onClick={() => run.mutate("json")} disabled={run.isPending || !canGo}>JSON</Button>
        <Button variant="secondary" onClick={() => run.mutate("crm")} disabled={run.isPending || !canGo}>CRM CSV</Button>
      </div>
      {rows.length === 0 ? (
        <Empty title={copy.empty} body={copy.emptyBody} />
      ) : (
        <div className="border border-line">
          {rows.map((r) => (
            <div key={r.id} className="flex justify-between border-b border-line px-3 py-2 text-sm last:border-0">
              <span>{asDisplay(r.filename)}</span>
              <span className="font-mono text-mute">{asDisplay(r.row_count)} · {asDisplay(r.format)} · {asDisplay(r.scope)} · {formatWhen(r.created_at, "-", locale)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
