import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdminNetwork, testSource, toggleSource } from "@/lib/norr/actions";
import { Button } from "@/components/ui/button";
import { SourceStatePill, Stat } from "@/components/status";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/data-network")({ component: AdminDataNetwork });

function CountryChips({ countries }: { countries: string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {countries.map((c) => (
        <span key={c} className="whitespace-nowrap rounded border border-line px-1.5 py-0.5 font-mono text-[10px] tracking-wide">
          {c}
        </span>
      ))}
    </span>
  );
}

function AdminDataNetwork() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-network"], queryFn: () => getAdminNetwork() });
  const test = useMutation({
    mutationFn: (sourceId: string) => testSource({ data: { sourceId } }),
    onSuccess: (r) => {
      toast.message(r.ok ? `OK: ${r.detail}` : r.error ?? "Failed");
      void qc.invalidateQueries({ queryKey: ["admin-network"] });
    },
  });
  const toggle = useMutation({
    mutationFn: (payload: { sourceId: string; enabled: boolean }) => toggleSource({ data: payload }),
    onSuccess: (r) => {
      toast.message(r.ok ? "Kill-switch saved" : r.error ?? "Failed");
      void qc.invalidateQueries({ queryKey: ["admin-network"] });
    },
  });
  const data = q.data && q.data.ok ? q.data : null;
  const engines = data?.engines ?? [];
  const sources = data?.sources ?? [];
  const core = engines.filter((e: any) => e.core);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Data network</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">
          First-party collectors stay online. Licensed API keys are optional upgrades, never required.
          Live status is never faked.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {core.map((e: any) => (
          <Stat
            key={e.id}
            label={e.label}
            value={e.status === "connected" ? "Online" : `${e.online}/${e.total}`}
            hint={e.blurb}
          />
        ))}
      </div>

      <div className="space-y-3 md:hidden">
        {sources.map((s: any) => {
          const h = s.health as Record<string, unknown> | null;
          const state = String(h?.state ?? s.liveState);
          return (
            <article key={s.id} className="border border-line p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm">{s.name}</div>
                  <div className="mt-1 text-[11px] text-mute">{s.licence}</div>
                </div>
                <SourceStatePill state={state} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mute">
                <CountryChips countries={s.countries ?? []} />
                <span>{s.open ? "open" : "optional"}</span>
                <span>{s.keyNote ?? (s.keyRequired ? (s.envPresent ? "key present" : "key absent") : "open")}</span>
                <span className="font-mono">{h?.last_latency_ms != null ? `${h.last_latency_ms} ms` : ""}</span>
              </div>
              <div className="mt-2 text-[11px] text-mute">{h?.last_test_detail ? String(h.last_test_detail).slice(0, 80) : "never tested"}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => test.mutate(s.id)} disabled={test.isPending || !s.implemented}>
                  Probe
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => toggle.mutate({ sourceId: s.id, enabled: h?.enabled === false })}
                  disabled={toggle.isPending}
                >
                  {h?.enabled === false ? "Turn on" : "Kill"}
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[960px] border border-line text-left text-sm">
          <thead className="bg-panel text-[11px] uppercase tracking-[0.12em] text-faint">
            <tr>
              {["Source", "Coverage", "Access", "State", "Key", "Latency", "Last test", ""].map((h) => (
                <th key={h} className="border-b border-line px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((s: any) => {
              const h = s.health as Record<string, unknown> | null;
              return (
                <tr key={s.id} className="border-b border-line align-top">
                  <td className="px-3 py-2">
                    <div>{s.name}</div>
                    <div className="text-[11px] text-mute">{s.licence}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    <CountryChips countries={s.countries ?? []} />
                  </td>
                  <td className="px-3 py-2 text-xs text-mute">{s.open ? "open" : "optional"}{s.implemented ? "" : " · not implemented"}</td>
                  <td className="px-3 py-2"><SourceStatePill state={String(h?.state ?? s.liveState)} /></td>
                  <td className="px-3 py-2 font-mono text-[11px]">
                    {s.keyNote ?? (s.keyRequired ? (s.envPresent ? "key present" : "key absent") : "-")}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{h?.last_latency_ms != null ? `${h.last_latency_ms} ms` : "-"}</td>
                  <td className="max-w-xs px-3 py-2 text-[11px] text-mute">{h?.last_test_detail ? String(h.last_test_detail).slice(0, 80) : "never"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => test.mutate(s.id)} disabled={test.isPending || !s.implemented}>
                        Probe
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => toggle.mutate({ sourceId: s.id, enabled: h?.enabled === false })}
                        disabled={toggle.isPending}
                      >
                        {h?.enabled === false ? "Turn on" : "Kill"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
